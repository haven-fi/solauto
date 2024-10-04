import { TransactionBuilder } from "@metaplex-foundation/umi";
import { SolautoClient } from "../clients/solautoClient";
import { ErrorsToThrow } from "../utils/generalUtils";
import { PriorityFeeSetting, TransactionRunType } from "../types";
import { ReferralStateManager } from "../clients";
export declare class TransactionItem {
    fetchTx: (attemptNum: number) => Promise<{
        tx: TransactionBuilder;
        lookupTableAddresses?: string[];
    } | undefined>;
    name?: string | undefined;
    lookupTableAddresses: string[];
    tx?: TransactionBuilder;
    constructor(fetchTx: (attemptNum: number) => Promise<{
        tx: TransactionBuilder;
        lookupTableAddresses?: string[];
    } | undefined>, name?: string | undefined);
    initialize(): Promise<void>;
    refetch(attemptNum: number): Promise<void>;
    uniqueAccounts(): string[];
}
export declare enum TransactionStatus {
    Skipped = "Skipped",
    Processing = "Processing",
    Queued = "Queued",
    Successful = "Successful",
    Failed = "Failed"
}
export type TransactionManagerStatuses = {
    name: string;
    attemptNum: number;
    status: TransactionStatus;
    moreInfo?: string;
    simulationSuccessful?: boolean;
    txSig?: string;
}[];
export declare class TransactionsManager {
    private txHandler;
    private statusCallback?;
    private txType?;
    private mustBeAtomic?;
    private errorsToThrow?;
    private retries;
    private retryDelay;
    private statuses;
    private lookupTables;
    constructor(txHandler: SolautoClient | ReferralStateManager, statusCallback?: ((statuses: TransactionManagerStatuses) => void) | undefined, txType?: TransactionRunType | undefined, mustBeAtomic?: boolean | undefined, errorsToThrow?: ErrorsToThrow | undefined, retries?: number, retryDelay?: number);
    private assembleTransactionSets;
    private updateStatus;
    private debugAccounts;
    clientSend(transactions: TransactionItem[], prioritySetting?: PriorityFeeSetting): Promise<TransactionManagerStatuses>;
    send(items: TransactionItem[], prioritySetting?: PriorityFeeSetting, initialized?: boolean): Promise<TransactionManagerStatuses>;
    private sendTransaction;
}
//# sourceMappingURL=transactionsManager.d.ts.map