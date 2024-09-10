import { AddressLookupTableInput, TransactionBuilder, Umi } from "@metaplex-foundation/umi";
import { SolautoClient } from "../clients/solautoClient";
import { ErrorsToThrow } from "../utils/generalUtils";
import { PriorityFeeSetting } from "../types";
import { TxHandler } from "../clients";
declare class LookupTables {
    defaultLuts: string[];
    private umi;
    cache: AddressLookupTableInput[];
    constructor(defaultLuts: string[], umi: Umi);
    getLutInputs(additionalAddresses: string[]): Promise<AddressLookupTableInput[]>;
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
    Successful = "Successful"
}
export type TransactionManagerStatuses = {
    name: string;
    status: TransactionStatus;
    txSig?: string;
}[];
export declare class TransactionsManager {
    private txHandler;
    private statusCallback?;
    private simulateOnly?;
    private mustBeAtomic?;
    private errorsToThrow?;
    private statuses;
    private lookupTables;
    constructor(txHandler: TxHandler, statusCallback?: ((statuses: TransactionManagerStatuses) => void) | undefined, simulateOnly?: boolean | undefined, mustBeAtomic?: boolean | undefined, errorsToThrow?: ErrorsToThrow | undefined);
    private assembleTransactionSets;
    updateStatus(name: string, status: TransactionStatus, txSig?: string): void;
    debugAccounts(itemSet: TransactionSet, tx: TransactionBuilder): Promise<void>;
    sendWithClient(items: TransactionItem[], client: SolautoClient, prioritySetting?: PriorityFeeSetting): Promise<void>;
    send(items: TransactionItem[], prioritySetting?: PriorityFeeSetting, initialized?: boolean): Promise<void>;
}
export {};
//# sourceMappingURL=transactionsManager.d.ts.map