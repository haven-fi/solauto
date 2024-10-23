import { TransactionBuilder, Umi } from "@metaplex-foundation/umi";
import { PublicKey } from "@solana/web3.js";
import { SolautoClient } from "../clients/solautoClient";
import { ReferralStateManager } from "../clients";
import { TransactionItemInputs } from "../types";
export declare function rebalanceChoresBefore(client: SolautoClient, tx: TransactionBuilder, accountsGettingCreated: string[]): Promise<TransactionBuilder>;
export declare function getTransactionChores(client: SolautoClient, tx: TransactionBuilder): Promise<[TransactionBuilder, TransactionBuilder]>;
export declare function requiresRefreshBeforeRebalance(client: SolautoClient): Promise<boolean>;
export declare function buildSolautoRebalanceTransaction(client: SolautoClient, targetLiqUtilizationRateBps?: number, attemptNum?: number): Promise<TransactionItemInputs | undefined>;
export declare function convertReferralFeesToDestination(referralManager: ReferralStateManager, tokenAccount: PublicKey, destinationMint: PublicKey): Promise<TransactionItemInputs | undefined>;
export declare function getErrorInfo(umi: Umi, tx: TransactionBuilder, error: any): {
    errorName: string | undefined;
    errorInfo: string | undefined;
    canBeIgnored: boolean;
};
//# sourceMappingURL=transactionUtils.d.ts.map