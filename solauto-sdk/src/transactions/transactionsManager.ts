import bs58 from "bs58";
import {
  AddressLookupTableInput,
  transactionBuilder,
  TransactionBuilder,
  Umi,
} from "@metaplex-foundation/umi";
import { SolautoClient } from "../clients/solautoClient";
import {
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
import { TransactionExpiredBlockheightExceededError } from "@solana/web3.js";
// import { sendJitoBundledTransactions } from "../utils/jitoUtils";

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

  constructor(
    public fetchTx: (
      attemptNum: number
    ) => Promise<TransactionItemInputs | undefined>,
    public name?: string
  ) {}

  async initialize() {
    await this.refetch(0);
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

    return (await this.getSingleTransaction())
      .add(item.tx)
      .setAddressLookupTables(
        await this.lookupTables.getLutInputs([
          ...this.lutAddresses(),
          ...item.lookupTableAddresses,
        ])
      )
      .fitsInOneTransaction(this.txHandler.umi);
  }

  add(...items: TransactionItem[]) {
    this.items.push(
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

    return transactionBuilder()
      .add(transactions)
      .setAddressLookupTables(
        await this.lookupTables.getLutInputs(this.lutAddresses())
      );
  }

  lutAddresses(): string[] {
    return Array.from(
      new Set(this.items.map((x) => x.lookupTableAddresses).flat())
    );
  }

  name(): string {
    const names = this.items
      .filter((x) => x.tx && x.name !== undefined)
      .map((x) => x.name!.toLowerCase());
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

    for (let i = 0; i < items.length; ) {
      let item = items[i];
      i++;

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
        for (let j = i; j < items.length; j++) {
          if (await newSet.fitsWith(items[j])) {
            newSet.add(items[j]);
            i++;
          } else {
            break;
          }
        }
        transactionSets.push(newSet);
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

  // TODO remove me
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

  private getUpdatedPriorityFeeSetting(prevError?: Error) {
    if (prevError instanceof TransactionExpiredBlockheightExceededError) {
      const currIdx = priorityFeeSettingValues.indexOf(this.priorityFeeSetting);
      return priorityFeeSettingValues[
        Math.min(priorityFeeSettingValues.length - 1, currIdx + 1)
      ];
    }
    return this.priorityFeeSetting;
  }

  public async clientSend(
    transactions: TransactionItem[]
  ): Promise<TransactionManagerStatuses> {
    const items = [...transactions];
    const client = this.txHandler as SolautoClient;

    const updateLookupTable = await client.updateLookupTable();
    const updateLutTxName = "create lookup table";
    if (
      updateLookupTable &&
      updateLookupTable.updateLutTx.getInstructions().length > 0 &&
      updateLookupTable?.needsToBeIsolated
    ) {
      await retryWithExponentialBackoff(
        async (attemptNum, prevError) =>
          await this.sendTransaction(
            updateLookupTable.updateLutTx,
            updateLutTxName,
            attemptNum,
            this.getUpdatedPriorityFeeSetting(prevError)
          ),
        3,
        150,
        this.errorsToThrow
      );
    }

    this.lookupTables.defaultLuts = client.defaultLookupTables();

    for (const item of items) {
      await item.initialize();
    }

    const [choresBefore, choresAfter] = await getTransactionChores(
      client,
      transactionBuilder().add(
        items
          .filter((x) => x.tx && x.tx.getInstructions().length > 0)
          .map((x) => x.tx!)
      )
    );
    if (updateLookupTable && !updateLookupTable.needsToBeIsolated) {
      choresBefore.prepend(updateLookupTable.updateLutTx);
    }
    if (choresBefore.getInstructions().length > 0) {
      const chore = new TransactionItem(async () => ({ tx: choresBefore }));
      await chore.initialize();
      items.unshift(chore);
      this.txHandler.log(
        "Chores before: ",
        choresBefore.getInstructions().length
      );
    }
    if (choresAfter.getInstructions().length > 0) {
      const chore = new TransactionItem(async () => ({ tx: choresAfter }));
      await chore.initialize();
      items.push(chore);
      this.txHandler.log(
        "Chores after: ",
        choresAfter.getInstructions().length
      );
    }

    const result = await this.send(items, true).catch((e) => {
      client.resetLiveTxUpdates(false);
      throw e;
    });

    if (this.txType !== "only-simulate") {
      await client.resetLiveTxUpdates();
    }

    return result;
  }

  public async send(
    items: TransactionItem[],
    initialized?: boolean
  ): Promise<TransactionManagerStatuses> {
    this.statuses = [];
    this.lookupTables.reset();

    if (!initialized) {
      for (const item of items) {
        await item.initialize();
      }
    }

    const itemSets = await this.assembleTransactionSets(items);
    const statusesStartIdx = this.statuses.length;
    for (const itemSet of itemSets) {
      this.updateStatus(itemSet.name(), TransactionStatus.Queued, 0);
    }

    if (this.txType === "only-simulate" && itemSets.length > 1) {
      this.txHandler.log(
        "Only simulate and more than 1 transaction. Skipping..."
      );
      return [];
    }

    for (let i = 0; i < itemSets.length; i++) {
      const getFreshItemSet = async (
        itemSet: TransactionSet,
        attemptNum: number
      ) => {
        await itemSet.refetchAll(attemptNum);
        const newItemSets = await this.assembleTransactionSets([
          ...itemSet.items,
          ...itemSets
            .slice(i + 1)
            .map((x) => x.items)
            .flat(),
        ]);
        if (newItemSets.length > 1) {
          this.statuses.splice(
            statusesStartIdx + i,
            itemSets.length - i,
            ...newItemSets.map((x) => ({
              name: x.name(),
              status: TransactionStatus.Queued,
              attemptNum: 0,
            }))
          );
          this.txHandler.log(this.statuses);
          itemSets.splice(
            i + 1,
            itemSets.length - i - 1,
            ...newItemSets.slice(1)
          );
        }
        return newItemSets.length > 0 ? newItemSets[0] : undefined;
      };

      let itemSet: TransactionSet | undefined = itemSets[i];
      await retryWithExponentialBackoff(
        async (attemptNum, prevError) => {
          itemSet =
            i > 0 || attemptNum > 0
              ? await getFreshItemSet(itemSet!, attemptNum)
              : itemSet;
          if (!itemSet) {
            return;
          }
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
              this.getUpdatedPriorityFeeSetting(prevError)
            );
          }
        },
        this.retries,
        this.retryDelay,
        this.errorsToThrow
      );
    }

    return this.statuses;
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
        errorString
      );
      this.txHandler.log(errorString);

      if (!errorDetails.canBeIgnored) {
        throw e;
      }
    }
  }
}
