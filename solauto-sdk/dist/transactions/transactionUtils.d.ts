import { TransactionBuilder, Umi } from "@metaplex-foundation/umi";
import { PublicKey } from "@solana/web3.js";
import { ReferralState } from "../generated";
import { SolautoClient } from "../clients/solautoClient";
export declare function rebalanceChoresBefore(client: SolautoClient, tx: TransactionBuilder, accountsGettingCreated: string[]): Promise<TransactionBuilder>;
export declare function getTransactionChores(client: SolautoClient, tx: TransactionBuilder): Promise<[TransactionBuilder, TransactionBuilder]>;
export declare function requiresRefreshBeforeRebalance(client: SolautoClient): boolean;
export declare function buildSolautoRebalanceTransaction(client: SolautoClient, targetLiqUtilizationRateBps?: number, attemptNum?: number): Promise<{
    tx: TransactionBuilder;
    lookupTableAddresses: string[];
} | undefined>;
export declare function convertReferralFeesToDestination(umi: Umi, referralState: ReferralState, tokenAccount: PublicKey): Promise<[TransactionBuilder, string[]] | undefined>;
export declare function getErrorInfo(tx: TransactionBuilder, error: any): {
    errorName: string;
    errorInfo: string;
    canBeIgnored: boolean;
};
//# sourceMappingURL=transactionUtils.d.ts.map