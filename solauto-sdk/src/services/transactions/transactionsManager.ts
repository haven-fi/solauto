import bs58 from "bs58";
import {
  PublicKey,
  TransactionExpiredBlockheightExceededError,
} from "@solana/web3.js";
import {
  AddressLookupTableInput,
  transactionBuilder,
  TransactionBuilder,
  Umi,
} from "@metaplex-foundation/umi";
import {
  PriorityFeeSetting,
  priorityFeeSettingValues,
  TransactionItemInputs,
  TransactionRunType,
} from "../../types";
import {
  SOLAUTO_PROD_PROGRAM,
  SOLAUTO_TEST_PROGRAM,
  SWITCHBOARD_PRICE_FEED_IDS,
} from "../../constants";
import {
  consoleLog,
  ErrorsToThrow,
  retryWithExponentialBackoff,
  addTxOptimizations,
  getAddressLookupInputs,
  sendSingleOptimizedTransaction,
  buildSwbSubmitResponseTx,
  getSwitchboardFeedData,
  sendJitoBundledTransactions,
} from "../../utils";
import { SolautoClient, ReferralStateManager, TxHandler } from "../solauto";
import { getErrorInfo, getTransactionChores } from "./transactionUtils";

const CHORES_TX_NAME = "account chores";
const MAX_SUPPORTED_ACCOUNT_LOCKS = 64;

export class TransactionTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionTooLargeError";
    Object.setPrototypeOf(this, TransactionTooLargeError.prototype);
  }
}

class LookupTables {
  cache: AddressLookupTableInput[] = [];

  constructor(
    public defaultLuts: string[],
    private umi: Umi
  ) {}

  async getLutInputs(
    additionalAddresses?: string[]
  ): Promise<AddressLookupTableInput[]> {
    const addresses = [...this.defaultLuts, ...(additionalAddresses ?? [])];
    const currentCacheAddresses = this.cache.map((x) => x.publicKey.toString());

    const missingAddresses = addresses.filter(
      (x) => !currentCacheAddresses.includes(x)
    );
    if (missingAddresses) {
      const additionalInputs = await getAddressLookupInputs(
        this.umi,
        missingAddresses
      );
      this.cache.push(...additionalInputs);
    }

    return this.cache;
  }

  reset() {
    this.cache = this.cache.filter((x) =>
      this.defaultLuts.includes(x.publicKey.toString())
    );
  }
}

export class TransactionItem {
  lookupTableAddresses!: string[];
  tx?: TransactionBuilder;
  initialized: boolean = false;
  orderPrio: number = 0;

  constructor(
    public fetchTx: (
      attemptNum: number
    ) => Promise<TransactionItemInputs | undefined>,
    public name?: string
  ) {}

  async initialize() {
    await this.refetch(0);
    this.initialized = true;
  }

  async refetch(attemptNum: number) {
    const resp = await this.fetchTx(attemptNum);
    this.tx = resp?.tx;
    this.lookupTableAddresses = resp?.lookupTableAddresses ?? [];
    this.orderPrio = resp?.orderPrio ?? 0;
  }

  uniqueAccounts(): string[] {
    return Array.from(
      new Set(
        this.tx!.getInstructions()
          .map((x) => [
            x.programId.toString(),
            ...x.keys.map((y) => y.pubkey.toString()),
          ])
          .flat()
      )
    );
  }
}

class TransactionSet {
  constructor(
    private txHandler: TxHandler,
    public lookupTables: LookupTables,
    public items: TransactionItem[] = []
  ) {}

  async lutInputs(): Promise<AddressLookupTableInput[]> {
    const lutInputs = await this.lookupTables.getLutInputs(this.lutAddresses());

    return lutInputs.filter(
      (lut, index, self) =>
        index ===
        self.findIndex(
          (item) => item.publicKey.toString() === lut.publicKey.toString()
        )
    );
  }

  async fitsWith(item: TransactionItem): Promise<boolean> {
    if (!item.tx) {
      return true;
    }

    const accountLocks = Array.from(
      new Set([
        ...this.items.map((x) => x.uniqueAccounts()),
        ...item.uniqueAccounts(),
      ])
    ).length;
    if (accountLocks > MAX_SUPPORTED_ACCOUNT_LOCKS) {
      return false;
    }

    const singleTx = await this.getSingleTransaction();
    const tx = addTxOptimizations(this.txHandler.umi.identity, singleTx, 1, 1)
      .add(item.tx)
      .setAddressLookupTables(
        await this.lookupTables.getLutInputs([
          ...this.lutAddresses(),
          ...item.lookupTableAddresses,
        ])
      );

    return tx.fitsInOneTransaction(this.txHandler.umi);
  }

  add(...items: TransactionItem[]) {
    this.items.push(
      ...items.filter((x) => x.tx && x.tx.getInstructions().length > 0)
    );
  }

  prepend(...items: TransactionItem[]) {
    this.items.unshift(
      ...items.filter((x) => x.tx && x.tx.getInstructions().length > 0)
    );
  }

  async reset() {
    await this.txHandler.resetLiveTxUpdates();
  }

  async refetchAll(attemptNum: number) {
    for (const item of this.items) {
      await item.refetch(attemptNum);
    }
  }

  async getSingleTransaction(): Promise<TransactionBuilder> {
    const transactions = this.items
      .filter((x) => x.tx && x.tx.getInstructions().length > 0)
      .map((x) => x.tx!);

    return transactionBuilder()
      .add(transactions)
      .setAddressLookupTables(await this.lutInputs());
  }

  lutAddresses(): string[] {
    return Array.from(
      new Set(this.items.map((x) => x.lookupTableAddresses).flat())
    );
  }

  name(): string {
    let names = this.items
      .filter((x) => x.tx && Boolean(x.name))
      .map((x) => x.name!.toLowerCase());
    if (names.length > 1) {
      names = names.filter((x) => x !== CHORES_TX_NAME);
    }
    if (names.length >= 3) {
      return [names.slice(0, -1).join(", "), names[names.length - 1]].join(
        ", and "
      );
    } else {
      return names.join(" & ");
    }
  }
}

export enum TransactionStatus {
  Skipped = "Skipped",
  Processing = "Processing",
  Queued = "Queued",
  Successful = "Successful",
  Failed = "Failed",
}

export type TransactionManagerStatuses = {
  name: string;
  attemptNum: number;
  status: TransactionStatus;
  moreInfo?: string;
  simulationSuccessful?: boolean;
  txSig?: string;
}[];

interface RetryConfig {
  signableRetries?: number;
  totalRetries?: number;
  retryDelay?: number;
}

export class TransactionsManager {
  private statuses: TransactionManagerStatuses = [];
  private lookupTables: LookupTables;
  private signableRetries: number;
  private totalRetries: number;
  private retryDelay: number;

  updateOracleTxName = "update oracle";

  constructor(
    private txHandler: SolautoClient | ReferralStateManager,
    private statusCallback?: (statuses: TransactionManagerStatuses) => void,
    private txType?: TransactionRunType,
    private priorityFeeSetting: PriorityFeeSetting = PriorityFeeSetting.Min,
    private atomically: boolean = true,
    private errorsToThrow?: ErrorsToThrow,
    retryConfig?: RetryConfig
  ) {
    this.lookupTables = new LookupTables(
      this.txHandler.defaultLookupTables(),
      this.txHandler.umi
    );
    this.signableRetries =
      retryConfig?.signableRetries ?? retryConfig?.totalRetries ?? 4;
    this.totalRetries =
      retryConfig?.totalRetries ?? retryConfig?.signableRetries ?? 4;
    this.retryDelay = retryConfig?.retryDelay ?? 150;
  }

  private async assembleTransactionSets(
    items: TransactionItem[]
  ): Promise<TransactionSet[]> {
    let transactionSets: TransactionSet[] = [];
    this.txHandler.log(`Reassembling ${items.length} items`);

    const txItems = items.sort((a, b) => a.orderPrio - b.orderPrio);

    for (let i = txItems.length - 1; i >= 0; ) {
      let item = txItems[i];
      i--;

      if (!item.tx) {
        continue;
      }

      const transaction = item.tx.setAddressLookupTables(
        await this.lookupTables.getLutInputs(item.lookupTableAddresses)
      );
      if (!transaction.fitsInOneTransaction(this.txHandler.umi)) {
        throw new TransactionTooLargeError(
          `Exceeds max transaction size (${transaction.getTransactionSize(this.txHandler.umi)})`
        );
      } else {
        let newSet = new TransactionSet(this.txHandler, this.lookupTables, [
          item,
        ]);
        for (let j = i; j >= 0; j--) {
          if (await newSet.fitsWith(txItems[j])) {
            newSet.prepend(txItems[j]);
            i--;
          } else {
            break;
          }
        }
        transactionSets.unshift(newSet);
      }
    }

    return transactionSets;
  }

  private updateStatus(
    name: string,
    status: TransactionStatus,
    attemptNum: number,
    txSig?: string,
    simulationSuccessful?: boolean,
    moreInfo?: string
  ) {
    if (!this.statuses.filter((x) => x.name === name)) {
      this.statuses.push({
        name,
        status,
        txSig,
        attemptNum,
        simulationSuccessful,
        moreInfo,
      });
    } else {
      const idx = this.statuses.findIndex(
        (x) => x.name === name && x.attemptNum === attemptNum
      );
      if (idx !== -1) {
        this.statuses[idx].status = status;
        this.statuses[idx].txSig = txSig;
        if (simulationSuccessful) {
          this.statuses[idx].simulationSuccessful = simulationSuccessful;
        }
        if (moreInfo) {
          this.statuses[idx].moreInfo = moreInfo;
        }
      } else {
        this.statuses.push({
          name,
          status,
          txSig,
          attemptNum,
          simulationSuccessful,
          moreInfo,
        });
      }
    }
    this.txHandler.log(`${name} is ${status.toString().toLowerCase()}`);
    this.statusCallback?.([...this.statuses]);
  }

  private async debugAccounts(itemSet: TransactionSet, tx: TransactionBuilder) {
    const lutInputs = await itemSet.lookupTables.getLutInputs([]);
    const lutAccounts = lutInputs.map((x) => x.addresses).flat();
    for (const ix of tx.getInstructions()) {
      const ixAccounts = ix.keys.map((x) => x.pubkey);
      const accountsNotInLut = ixAccounts.filter(
        (x) => !lutAccounts.includes(x)
      );
      this.txHandler.log(
        `Program ${ix.programId}, data len: ${ix.data.length}, LUT accounts data: ${ix.keys.filter((x) => lutAccounts.includes(x.pubkey)).length * 3}`
      );
      if (accountsNotInLut.length > 0) {
        this.txHandler.log(`${accountsNotInLut.length} accounts not in LUT:`);
        for (const key of accountsNotInLut) {
          this.txHandler.log(key.toString());
        }
      }
    }
  }

  private getUpdatedPriorityFeeSetting(
    prevError: Error | undefined,
    attemptNum: number
  ) {
    if (prevError instanceof TransactionExpiredBlockheightExceededError) {
      const currIdx = priorityFeeSettingValues.indexOf(this.priorityFeeSetting);
      return priorityFeeSettingValues[
        Math.min(
          priorityFeeSettingValues.length - 1,
          currIdx + Math.floor(attemptNum / 3)
        )
      ];
    }
    return this.priorityFeeSetting;
  }

  private updateStatusForSets(
    itemSets: TransactionSet[],
    status: TransactionStatus,
    attemptNum: number,
    txSigs?: string[],
    simulationSuccessful?: boolean,
    moreInfo?: string
  ) {
    itemSets.forEach((itemSet, i) => {
      this.updateStatus(
        itemSet.name(),
        status,
        attemptNum,
        txSigs !== undefined ? txSigs[i] : undefined,
        simulationSuccessful,
        moreInfo
      );
    });
  }

  private async updateLut(tx: TransactionBuilder, newLut: boolean) {
    const lutInputs = await this.lookupTables.getLutInputs();
    const updateLutTxName = `${newLut ? "create" : "update"} lookup table`;
    await retryWithExponentialBackoff(
      async (attemptNum, prevError) =>
        await this.sendTransaction(
          tx.setAddressLookupTables(lutInputs),
          updateLutTxName,
          attemptNum,
          this.getUpdatedPriorityFeeSetting(prevError, attemptNum),
          "skip-simulation"
        ),
      this.signableRetries,
      150,
      this.errorsToThrow
    );
    await this.txHandler.refetchReferralState();
  }

  public async clientSend(
    transactions: TransactionItem[]
  ): Promise<TransactionManagerStatuses> {
    const items = [...transactions];
    const client = this.txHandler as SolautoClient;

    const updateLut = await client.updateLookupTable();

    if (
      updateLut &&
      (updateLut?.new ||
        updateLut.accountsToAdd.length > 4 ||
        (client.pos.memecoinPosition && updateLut.accountsToAdd.length >= 2))
    ) {
      await this.updateLut(updateLut.tx, updateLut.new);
    }
    this.lookupTables.defaultLuts = client.defaultLookupTables();

    for (const item of items) {
      await item.initialize();
    }

    const allAccounts = items.flatMap((item) => {
      return (
        item.tx
          ?.getInstructions()
          .filter((ix) => {
            return (
              ix.programId.toString() === SOLAUTO_PROD_PROGRAM.toString() ||
              ix.programId.toString() === SOLAUTO_TEST_PROGRAM.toString()
            );
          })
          .flatMap((ix) => {
            return ix.keys.map((key) => key.pubkey.toString());
          }) ?? []
      );
    });

    const swbOracle = allAccounts.find((x) =>
      Object.values(SWITCHBOARD_PRICE_FEED_IDS)
        .map((x) => x.feedId)
        .includes(x ?? "")
    );
    if (swbOracle) {
      const mint = new PublicKey(
        Object.keys(SWITCHBOARD_PRICE_FEED_IDS).find(
          (x) => SWITCHBOARD_PRICE_FEED_IDS[x].feedId === swbOracle
        )!
      );
      const stale = (await getSwitchboardFeedData(client.connection, [mint]))[0]
        .stale;

      if (stale) {
        this.txHandler.log("Requires oracle update...");
        const swbTx = new TransactionItem(
          async () =>
            buildSwbSubmitResponseTx(client.connection, client.signer, mint),
          this.updateOracleTxName
        );
        await swbTx.initialize();
        items.unshift(swbTx);
      }
    }

    let [choresBefore, choresAfter] = await getTransactionChores(
      client,
      transactionBuilder().add(
        items
          .filter((x) => x.tx && x.tx.getInstructions().length > 0)
          .map((x) => x.tx!)
      )
    );
    if (updateLut && !updateLut?.new) {
      choresBefore = choresBefore.prepend(updateLut.tx);
    }
    if (choresBefore.getInstructions().length > 0) {
      const chore = new TransactionItem(
        async () => ({ tx: choresBefore }),
        CHORES_TX_NAME
      );
      await chore.initialize();
      items.unshift(chore);
      this.txHandler.log(
        "Chores before: ",
        choresBefore.getInstructions().length
      );
    }
    if (choresAfter.getInstructions().length > 0) {
      const chore = new TransactionItem(
        async () => ({ tx: choresAfter }),
        CHORES_TX_NAME
      );
      await chore.initialize();
      items.push(chore);
      this.txHandler.log(
        "Chores after: ",
        choresAfter.getInstructions().length
      );
    }

    const result = await this.send(items).catch((e) => {
      client.resetLiveTxUpdates(false);
      throw e;
    });

    if (this.txType !== "only-simulate") {
      await client.resetLiveTxUpdates();
    }

    return result;
  }

  public async send(
    items: TransactionItem[]
  ): Promise<TransactionManagerStatuses> {
    this.statuses = [];
    this.lookupTables.reset();

    const itemSets = await retryWithExponentialBackoff(async () => {
      for (const item of items) {
        if (!item.initialized) {
          await item.initialize();
        }
      }
      this.txHandler.log("Transaction items:", items.length);
      return await this.assembleTransactionSets(items);
    }, this.totalRetries);

    this.updateStatusForSets(itemSets, TransactionStatus.Queued, 0);
    this.txHandler.log("Initial item sets:", itemSets.length);

    if (this.atomically) {
      await this.processTransactionsAtomically(itemSets);
    } else {
      let currentIndex = 0;
      while (currentIndex < itemSets.length) {
        await this.processTransactionSet(itemSets, currentIndex);
        currentIndex++;
      }
    }

    return this.statuses;
  }

  private async processTransactionsAtomically(itemSets: TransactionSet[]) {
    let num = 0;
    let transactions: TransactionBuilder[] = [];

    await retryWithExponentialBackoff(
      async (attemptNum, prevError) => {
        if (
          prevError &&
          this.statuses.filter((x) => x.simulationSuccessful).length >
            this.signableRetries
        ) {
          throw prevError;
        }

        num = attemptNum;

        if (attemptNum > 0) {
          const refreshedSets = await this.refreshItemSets(
            itemSets,
            attemptNum
          );
          if (!refreshedSets || !refreshedSets.length) {
            return;
          } else {
            itemSets = refreshedSets;
          }
        }

        transactions = [];
        for (const set of itemSets) {
          transactions.push(await set.getSingleTransaction());
        }
        transactions = transactions.filter(
          (x) => x.getInstructions().length > 0
        );
        if (transactions.length === 0) {
          this.updateStatusForSets(
            itemSets,
            TransactionStatus.Skipped,
            attemptNum
          );
          return;
        }

        this.updateStatusForSets(
          itemSets,
          TransactionStatus.Processing,
          attemptNum
        );
        for (const itemSet of itemSets) {
          await this.debugAccounts(
            itemSet,
            await itemSet.getSingleTransaction()
          );
        }

        let txSigs: string[] | undefined;
        let error: Error | undefined;
        try {
          txSigs = await sendJitoBundledTransactions(
            this.txHandler.umi,
            this.txHandler.connection,
            this.txHandler.signer,
            this.txHandler.otherSigners,
            transactions,
            this.txType,
            this.getUpdatedPriorityFeeSetting(prevError, attemptNum),
            () =>
              this.updateStatusForSets(
                itemSets,
                TransactionStatus.Processing,
                attemptNum,
                undefined,
                true
              )
          );
        } catch (e: any) {
          error = e as Error;
        }

        if (
          error ||
          (this.txType !== "only-simulate" &&
            (!Boolean(txSigs) || txSigs?.length === 0))
        ) {
          this.updateStatusForSets(
            itemSets,
            TransactionStatus.Failed,
            attemptNum,
            txSigs,
            undefined,
            error?.message
          );
          throw error ? error : new Error("Unknown error");
        }

        this.updateStatusForSets(
          itemSets,
          TransactionStatus.Successful,
          attemptNum,
          txSigs
        );
      },
      this.totalRetries,
      this.retryDelay,
      this.errorsToThrow
    ).catch((e: Error) => {
      this.txHandler.log("Capturing error info...");
      const errorDetails = getErrorInfo(
        this.txHandler.umi,
        transactions,
        e,
        itemSets.filter(
          (x) =>
            this.statuses.find((y) => x.name() === y.name)?.simulationSuccessful
        ).length === itemSets.length
      );

      const errorString = `${errorDetails.errorName ?? "Unknown error"}: ${errorDetails.errorInfo?.split("\n")[0] ?? "unknown"}`;
      const errorInfo =
        errorDetails.errorName || errorDetails.errorInfo
          ? errorString
          : e.message;
      this.updateStatusForSets(
        itemSets,
        errorDetails.canBeIgnored
          ? TransactionStatus.Skipped
          : TransactionStatus.Failed,
        num,
        undefined,
        undefined,
        errorInfo
      );

      if (!errorDetails.canBeIgnored) {
        throw new Error(errorInfo);
      }
    });
  }

  private async processTransactionSet(
    itemSets: TransactionSet[],
    currentIndex: number
  ) {
    let itemSet: TransactionSet | undefined = itemSets[currentIndex];
    await retryWithExponentialBackoff(
      async (attemptNum, prevError) => {
        if (
          prevError &&
          this.statuses.filter((x) => x.simulationSuccessful).length >
            this.signableRetries
        ) {
          throw prevError;
        }

        if (currentIndex > 0 || attemptNum > 0) {
          const refreshedSets = await this.refreshItemSets(
            itemSets,
            attemptNum,
            currentIndex
          );
          itemSet = refreshedSets ? refreshedSets[0] : undefined;
        }
        if (!itemSet) return;

        const tx = await itemSet.getSingleTransaction();
        if (tx.getInstructions().length === 0) {
          this.updateStatus(
            itemSet.name(),
            TransactionStatus.Skipped,
            attemptNum
          );
        } else {
          await this.debugAccounts(itemSet, tx);
          await this.sendTransaction(
            tx,
            itemSet.name(),
            attemptNum,
            this.getUpdatedPriorityFeeSetting(prevError, attemptNum)
          );
        }
      },
      this.totalRetries,
      this.retryDelay,
      this.errorsToThrow
    );
  }

  private async refreshItemSets(
    itemSets: TransactionSet[],
    attemptNum: number,
    currentIndex?: number
  ): Promise<TransactionSet[] | undefined> {
    if (currentIndex !== undefined) {
      const itemSet = itemSets[currentIndex];
      await itemSet.reset();
      await itemSet.refetchAll(attemptNum);
    } else {
      await Promise.all(itemSets.map((itemSet) => itemSet.reset()));
      await Promise.all(
        itemSets.map((itemSet) => itemSet.refetchAll(attemptNum))
      );
    }

    const newItemSets = await this.assembleTransactionSets(
      currentIndex !== undefined
        ? [
            ...itemSets[currentIndex].items,
            ...itemSets.slice(currentIndex + 1).flatMap((set) => set.items),
          ]
        : itemSets.flatMap((set) => set.items)
    );

    const newItemSetNames = newItemSets.map((x) => x.name());
    if (
      newItemSetNames.length === 1 &&
      newItemSetNames[0] === this.updateOracleTxName
    ) {
      consoleLog("Skipping unnecessary oracle update");
      return undefined;
    }

    if (currentIndex !== undefined && newItemSets.length > 1) {
      itemSets.splice(
        currentIndex,
        itemSets.length - currentIndex,
        ...newItemSets
      );
      const startOfQueuedStatuses = this.statuses.findIndex(
        (x) => x.status === TransactionStatus.Queued
      );
      this.statuses.splice(
        startOfQueuedStatuses,
        this.statuses.length - startOfQueuedStatuses,
        ...newItemSets.map((x, i) => ({
          name: x.name(),
          attemptNum: i === 0 ? attemptNum : 0,
          status:
            i === 0 ? TransactionStatus.Processing : TransactionStatus.Queued,
        }))
      );
    }

    return newItemSets;
  }

  private async sendTransaction(
    tx: TransactionBuilder,
    txName: string,
    attemptNum: number,
    priorityFeeSetting?: PriorityFeeSetting,
    txType?: TransactionRunType
  ) {
    this.updateStatus(txName, TransactionStatus.Processing, attemptNum);
    try {
      const txSig = await sendSingleOptimizedTransaction(
        this.txHandler.umi,
        this.txHandler.connection,
        tx,
        txType ?? this.txType,
        priorityFeeSetting,
        () =>
          this.updateStatus(
            txName,
            TransactionStatus.Processing,
            attemptNum,
            undefined,
            true
          )
      );
      this.updateStatus(
        txName,
        TransactionStatus.Successful,
        attemptNum,
        txSig ? bs58.encode(txSig) : undefined
      );
    } catch (e: any) {
      this.txHandler.log("Capturing error info...");
      const errorDetails = getErrorInfo(
        this.txHandler.umi,
        [tx],
        e,
        this.statuses.find((x) => x.name === txName)?.simulationSuccessful
      );

      const errorString = `${errorDetails.errorName ?? "Unknown error"}: ${errorDetails.errorInfo?.split("\n")[0] ?? "unknown"}`;
      const errorInfo =
        errorDetails.errorName || errorDetails.errorInfo
          ? errorString
          : e.message;
      this.updateStatus(
        txName,
        errorDetails.canBeIgnored
          ? TransactionStatus.Skipped
          : TransactionStatus.Failed,
        attemptNum,
        undefined,
        undefined,
        errorInfo
      );

      if (!errorDetails.canBeIgnored) {
        throw new Error(errorInfo);
      }
    }
  }
}
