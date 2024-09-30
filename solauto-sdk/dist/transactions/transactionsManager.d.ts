import { AddressLookupTableInput, TransactionBuilder, Umi } from "@metaplex-foundation/umi";
import { SolautoClient } from "../clients/solautoClient";
import { ErrorsToThrow } from "../utils/generalUtils";
import { PriorityFeeSetting, TransactionRunType } from "../types";
import { ReferralStateManager, TxHandler } from "../clients";
declare class LookupTables {
    defaultLuts: string[];
    private umi;
    cache: AddressLookupTableInput[];
    constructor(defaultLuts: string[], umi: Umi);
    getLutInputs(additionalAddresses: string[]): Promise<AddressLookupTableInput[]>;
    reset(): void;
}
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
declare class TransactionSet {
    private txHandler;
    lookupTables: LookupTables;
    items: TransactionItem[];
    constructor(txHandler: TxHandler, lookupTables: LookupTables, items?: TransactionItem[]);
    fitsWith(item: TransactionItem): Promise<boolean>;
    add(...items: TransactionItem[]): void;
    refetchAll(attemptNum: number): Promise<void>;
    getSingleTransaction(): Promise<TransactionBuilder>;
    lutAddresses(): string[];
    name(): string;
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
    status: TransactionStatus;
    txSig?: string;
    attemptNum: number;
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
    updateStatus(name: string, status: TransactionStatus, attemptNum: number, txSig?: string): void;
    debugAccounts(itemSet: TransactionSet, tx: TransactionBuilder): Promise<void>;
    clientSend(transactions: TransactionItem[], prioritySetting?: PriorityFeeSetting): Promise<TransactionManagerStatuses>;
    send(items: TransactionItem[], prioritySetting?: PriorityFeeSetting, initialized?: boolean): Promise<TransactionManagerStatuses>;
}
export {};
//# sourceMappingURL=transactionsManager.d.ts.map