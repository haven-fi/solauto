import bs58 from "bs58";
import { TransactionExpiredBlockheightExceededError } from "@solana/web3.js";
import { TransactionBuilder } from "@metaplex-foundation/umi";
import {
  PriorityFeeSetting,
  priorityFeeSettingValues,
  TransactionRunType,
} from "../../../types";
import {
  consoleLog,
  ErrorsToThrow,
  retryWithExponentialBackoff,
  sendSingleOptimizedTransaction,
  sendJitoBundledTransactions,
} from "../../../utils";
import { TxHandler } from "../../solauto";
import { getErrorInfo } from "../transactionUtils";
import { LookupTables, TransactionItem, TransactionSet } from "../types";

export class TransactionTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionTooLargeError";
    Object.setPrototypeOf(this, TransactionTooLargeError.prototype);
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

export interface TransactionsManagerArgs<T extends TxHandler> {
  txHandler: T;
  statusCallback?: (statuses: TransactionManagerStatuses) => void;
  txRunType?: TransactionRunType;
  priorityFeeSetting?: PriorityFeeSetting;
  atomically?: boolean;
  errorsToThrow?: ErrorsToThrow;
  retryConfig?: RetryConfig;
  abortController?: AbortController;
}

export class TransactionsManager<T extends TxHandler> {
  protected txHandler: T;
  protected statusCallback?: (statuses: TransactionManagerStatuses) => void;
  protected txRunType?: TransactionRunType;
  protected priorityFeeSetting: PriorityFeeSetting;
  protected atomically: boolean;
  protected errorsToThrow?: ErrorsToThrow;
  protected statuses: TransactionManagerStatuses = [];
  protected lookupTables: LookupTables;
  protected signableRetries: number;
  protected totalRetries: number;
  protected retryDelay: number;
  protected abortController?: AbortController;

  updateOracleTxName = "update oracle";

  constructor(args: TransactionsManagerArgs<T>) {
    this.txHandler = args.txHandler;
    this.statusCallback = args.statusCallback;
    this.txRunType = args.txRunType;
    this.priorityFeeSetting = args.priorityFeeSetting ?? PriorityFeeSetting.Min;
    this.atomically = args.atomically ?? true;
    this.errorsToThrow = args.errorsToThrow;
    this.abortController = args.abortController;

    this.lookupTables = new LookupTables(
      this.txHandler.defaultLookupTables(),
      this.txHandler.umi
    );
    this.signableRetries =
      args.retryConfig?.signableRetries ?? args.retryConfig?.totalRetries ?? 4;
    this.totalRetries =
      args.retryConfig?.totalRetries ?? args.retryConfig?.signableRetries ?? 4;
    this.retryDelay = args.retryConfig?.retryDelay ?? 150;
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

  protected getUpdatedPriorityFeeSetting(
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

  private shouldProceedToSend(itemSets: TransactionSet[], attemptNum: number) {
    if (!itemSets) {
      return false;
    }

    const newItemSetNames = itemSets.flatMap((x) =>
      x.items.map((y) => y.name ?? "")
    );
    if (
      newItemSetNames.length === 1 &&
      newItemSetNames[0] === this.updateOracleTxName
    ) {
      consoleLog("Skipping unnecessary oracle update");
      this.updateStatusForSets(itemSets, TransactionStatus.Skipped, attemptNum);
      return false;
    }

    return true;
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
        this.priorityFeeSetting = this.getUpdatedPriorityFeeSetting(
          prevError,
          attemptNum
        );

        if (attemptNum > 0) {
          const refreshedSets = await this.refreshItemSets(
            itemSets,
            attemptNum,
            prevError
          );
          if (!refreshedSets || !refreshedSets.length) {
            return;
          } else {
            itemSets = refreshedSets;
          }
        }

        if (!this.shouldProceedToSend(itemSets, attemptNum)) {
          return;
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
            this.txRunType,
            this.priorityFeeSetting,
            () =>
              this.updateStatusForSets(
                itemSets,
                TransactionStatus.Processing,
                attemptNum,
                undefined,
                true
              ),
            this.abortController
          );
        } catch (e: any) {
          error = e as Error;
        }

        if (
          error ||
          (this.txRunType !== "only-simulate" &&
            (!Boolean(txSigs) || txSigs?.length === 0) &&
            !this.abortController?.signal.aborted)
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
            this.statuses.find(
              (y) => x.name() === y.name && y.attemptNum === num
            )?.simulationSuccessful
        ).length === itemSets.length,
        this.priorityFeeSetting
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
      consoleLog(errorString);

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
            prevError,
            currentIndex
          );
          itemSet = refreshedSets ? refreshedSets[0] : undefined;
        }
        if (!itemSet || !this.shouldProceedToSend([itemSet], attemptNum)) {
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
          this.priorityFeeSetting = this.getUpdatedPriorityFeeSetting(
            prevError,
            attemptNum
          );
          await this.sendTransaction(
            tx,
            itemSet.name(),
            attemptNum,
            this.priorityFeeSetting
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
    prevError?: Error,
    currentIndex?: number
  ): Promise<TransactionSet[] | undefined> {
    if (currentIndex !== undefined) {
      const itemSet = itemSets[currentIndex];
      await itemSet.reset();
      await itemSet.refetchAll(attemptNum, prevError);
    } else {
      await Promise.all(itemSets.map((itemSet) => itemSet.reset()));
      for (const itemSet of itemSets) {
        await itemSet.refetchAll(attemptNum, prevError);
      }
    }

    const newItemSets = await this.assembleTransactionSets(
      currentIndex !== undefined
        ? [
            ...itemSets[currentIndex].items,
            ...itemSets.slice(currentIndex + 1).flatMap((set) => set.items),
          ]
        : itemSets.flatMap((set) => set.items)
    );

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

  protected async sendTransaction(
    tx: TransactionBuilder,
    txName: string,
    attemptNum: number,
    priorityFeeSetting?: PriorityFeeSetting,
    txRunType?: TransactionRunType
  ) {
    this.updateStatus(txName, TransactionStatus.Processing, attemptNum);
    try {
      const txSig = await sendSingleOptimizedTransaction(
        this.txHandler.umi,
        this.txHandler.connection,
        tx,
        txRunType ?? this.txRunType,
        priorityFeeSetting,
        () =>
          this.updateStatus(
            txName,
            TransactionStatus.Processing,
            attemptNum,
            undefined,
            true
          ),
        this.abortController
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
        this.statuses.find(
          (x) => x.name === txName && x.attemptNum === attemptNum
        )?.simulationSuccessful,
        priorityFeeSetting
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
      consoleLog(errorString);

      if (!errorDetails.canBeIgnored) {
        throw new Error(errorInfo);
      }
    }
  }
}
