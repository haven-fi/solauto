import bs58 from "bs58";
import {
  AddressLookupTableInput,
  transactionBuilder,
  TransactionBuilder,
  Umi,
} from "@metaplex-foundation/umi";
import { SolautoClient } from "../clients/solautoClient";
import {
  addTxOptimizations,
  getAddressLookupInputs,
  sendSingleOptimizedTransaction,
} from "../utils/solanaUtils";
import {
  ErrorsToThrow,
  retryWithExponentialBackoff,
} from "../utils/generalUtils";
import { getErrorInfo, getTransactionChores } from "./transactionUtils";
import {
  PriorityFeeSetting,
  priorityFeeSettingValues,
  TransactionItemInputs,
  TransactionRunType,
} from "../types";
import { ReferralStateManager, TxHandler } from "../clients";
import {
  PublicKey,
  TransactionExpiredBlockheightExceededError,
} from "@solana/web3.js";
import { SWITCHBOARD_PRICE_FEED_IDS } from "../constants/switchboardConstants";
import { buildSwbSubmitResponseTx, getSwitchboardFeedData } from "../utils";
import { sendJitoBundledTransactions } from "../utils/jitoUtils";

const CHORES_TX_NAME = "account chores";

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
    additionalAddresses: string[]
  ): Promise<AddressLookupTableInput[]> {
    const addresses = [...this.defaultLuts, ...additionalAddresses];
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
  public initialized: boolean = false;

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
    if (accountLocks > 128) {
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

  async refetchAll(attemptNum: number) {
    await this.txHandler.resetLiveTxUpdates();
    for (const item of this.items) {
      await item.refetch(attemptNum);
    }
  }

  async getSingleTransaction(): Promise<TransactionBuilder> {
    const transactions = this.items
      .filter((x) => x.tx && x.tx.getInstructions().length > 0)
      .map((x) => x.tx!);

    const lutInputs = await this.lookupTables.getLutInputs(this.lutAddresses());
    return transactionBuilder()
      .add(transactions)
      .setAddressLookupTables(lutInputs);
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

export class TransactionsManager {
  private statuses: TransactionManagerStatuses = [];
  private lookupTables: LookupTables;

  constructor(
    private txHandler: SolautoClient | ReferralStateManager,
    private statusCallback?: (statuses: TransactionManagerStatuses) => void,
    private txType?: TransactionRunType,
    private priorityFeeSetting: PriorityFeeSetting = PriorityFeeSetting.Min,
    private atomically: boolean = false,
    private errorsToThrow?: ErrorsToThrow,
    private retries: number = 4,
    private retryDelay: number = 150
  ) {
    this.lookupTables = new LookupTables(
      this.txHandler.defaultLookupTables(),
      this.txHandler.umi
    );
  }

  private async assembleTransactionSets(
    items: TransactionItem[]
  ): Promise<TransactionSet[]> {
    let transactionSets: TransactionSet[] = [];
    this.txHandler.log(`Reassembling ${items.length} items`);

    for (let i = items.length - 1; i >= 0; ) {
      let item = items[i];
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
          if (await newSet.fitsWith(items[j])) {
            newSet.prepend(items[j]);
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
          currIdx + Math.floor(attemptNum / 2)
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
    const updateLutTxName = `${newLut ? "create" : "update"} lookup table`;
    await retryWithExponentialBackoff(
      async (attemptNum, prevError) =>
        await this.sendTransaction(
          tx,
          updateLutTxName,
          attemptNum,
          this.getUpdatedPriorityFeeSetting(prevError, attemptNum)
        ),
      3,
      150,
      this.errorsToThrow
    );
  }

  public async clientSend(
    transactions: TransactionItem[]
  ): Promise<TransactionManagerStatuses> {
    const items = [...transactions];
    const client = this.txHandler as SolautoClient;

    const updateLookupTable = await client.updateLookupTable();

    if (updateLookupTable && updateLookupTable?.new) {
      await this.updateLut(updateLookupTable.tx, updateLookupTable.new);
    }
    this.lookupTables.defaultLuts = client.defaultLookupTables();

    for (const item of items) {
      await item.initialize();
    }

    const allAccounts = items.flatMap((x) =>
      x.tx
        ?.getInstructions()
        .flatMap((x) => x.keys.map((x) => x.pubkey.toString()))
    );
    const swbOracle = allAccounts.find((x) =>
      Object.values(SWITCHBOARD_PRICE_FEED_IDS).includes(x ?? "")
    );
    if (swbOracle) {
      const mint = new PublicKey(
        Object.keys(SWITCHBOARD_PRICE_FEED_IDS).find(
          (x) => SWITCHBOARD_PRICE_FEED_IDS[x] === swbOracle
        )!
      );
      const stale = (await getSwitchboardFeedData(client.connection, [mint]))[0]
        .stale;

      if (stale) {
        this.txHandler.log("Requires oracle update...");
        const swbTx = new TransactionItem(
          async () =>
            buildSwbSubmitResponseTx(client.connection, client.signer, mint),
          "Update oracle"
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
    if (updateLookupTable && !updateLookupTable?.new) {
      choresBefore = choresBefore.prepend(updateLookupTable.tx);
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

    if (!items[0].initialized) {
      for (const item of items) {
        await item.initialize();
      }
    }

    this.txHandler.log("Transaction items:", items.length);
    const itemSets = await this.assembleTransactionSets(items);
    this.updateStatusForSets(itemSets, TransactionStatus.Queued, 0);
    this.txHandler.log("Initial item sets:", itemSets.length);

    if (this.txType === "only-simulate" && itemSets.length > 1) {
      this.txHandler.log(
        "Only simulate and more than 1 transaction. Skipping..."
      );
      return [];
    }

    if (itemSets.length > 1 && this.atomically) {
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

    await retryWithExponentialBackoff(
      async (attemptNum, prevError) => {
        num = attemptNum;

        if (attemptNum > 0) {
          for (let i = 0; i < itemSets.length; i++) {
            await itemSets[i].refetchAll(attemptNum);
          }
          itemSets = await this.assembleTransactionSets(
            itemSets.flatMap((x) => x.items)
          );
        }

        let transactions = [];
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

        let txSigs: string[] | undefined;
        let error: Error | undefined;
        try {
          txSigs = await sendJitoBundledTransactions(
            this.txHandler.umi,
            this.txHandler.connection,
            this.txHandler.signer,
            transactions,
            this.txType,
            this.getUpdatedPriorityFeeSetting(prevError, attemptNum)
          );
        } catch (e: any) {
          error = e as Error;
        }

        if (error || !Boolean(txSigs) || txSigs?.length === 0) {
          this.updateStatusForSets(
            itemSets,
            TransactionStatus.Failed,
            attemptNum,
            txSigs,
            true,
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
      this.retries,
      this.retryDelay,
      this.errorsToThrow
    ).catch((e: Error) => {
      this.updateStatusForSets(
        itemSets,
        TransactionStatus.Failed,
        num,
        undefined,
        true,
        e.message
      );
      throw e;
    });
  }

  private async processTransactionSet(
    itemSets: TransactionSet[],
    currentIndex: number
  ) {
    let itemSet: TransactionSet | undefined = itemSets[currentIndex];
    let num = 0;

    await retryWithExponentialBackoff(
      async (attemptNum, prevError) => {
        num = attemptNum;

        if (currentIndex > 0 || attemptNum > 0) {
          itemSet = await this.refreshItemSet(
            itemSets,
            currentIndex,
            attemptNum
          );
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
      this.retries,
      this.retryDelay,
      this.errorsToThrow
    ).catch((e: Error) => {
      if (itemSet) {
        this.updateStatus(
          itemSet.name(),
          TransactionStatus.Failed,
          num,
          undefined,
          undefined,
          e.message
        );
      }
      throw e;
    });
  }

  private async refreshItemSet(
    itemSets: TransactionSet[],
    currentIndex: number,
    attemptNum: number
  ): Promise<TransactionSet | undefined> {
    const itemSet = itemSets[currentIndex];
    await itemSet.refetchAll(attemptNum);

    const newItemSets = await this.assembleTransactionSets([
      ...itemSet.items,
      ...itemSets.slice(currentIndex + 1).flatMap((set) => set.items),
    ]);

    if (newItemSets.length > 1) {
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

    return newItemSets[0];
  }

  private async sendTransaction(
    tx: TransactionBuilder,
    txName: string,
    attemptNum: number,
    priorityFeeSetting?: PriorityFeeSetting
  ) {
    this.updateStatus(txName, TransactionStatus.Processing, attemptNum);
    try {
      const txSig = await sendSingleOptimizedTransaction(
        this.txHandler.umi,
        this.txHandler.connection,
        tx,
        this.txType,
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
      const errorDetails = getErrorInfo(this.txHandler.umi, tx, e);

      const errorString = `${errorDetails.errorName ?? "Unknown error"}: ${errorDetails.errorInfo ?? "unknown"}`;
      this.updateStatus(
        txName,
        errorDetails.canBeIgnored
          ? TransactionStatus.Skipped
          : TransactionStatus.Failed,
        attemptNum,
        undefined,
        undefined,
        errorDetails.errorName || errorDetails.errorInfo
          ? errorString
          : e.message
      );

      if (!errorDetails.canBeIgnored) {
        throw e;
      }
    }
  }
}
