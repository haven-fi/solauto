import { TransactionBuilder, Umi } from "@metaplex-foundation/umi";
import { Account as SplTokenAccount } from "@solana/spl-token";
import { ReferralState } from "../generated";
import { SolautoClient } from "../clients/solautoClient";
export declare function rebalanceChoresBefore(client: SolautoClient, tx: TransactionBuilder, accountsGettingCreated: string[]): Promise<TransactionBuilder>;
export declare function getTransactionChores(client: SolautoClient, tx: TransactionBuilder): Promise<[TransactionBuilder, TransactionBuilder]>;
export declare function buildSolautoRebalanceTransaction(client: SolautoClient, targetLiqUtilizationRateBps?: number, attemptNum?: number): Promise<{
    tx: TransactionBuilder;
    lookupTableAddresses: string[];
} | undefined>;
export declare function convertReferralFeesToDestination(umi: Umi, referralState: ReferralState, tokenAccount: SplTokenAccount): Promise<[TransactionBuilder, string[]] | undefined>;
//# sourceMappingURL=transactionUtils.d.ts.map