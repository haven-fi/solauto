import { PublicKey } from "@solana/web3.js";
import { Signer, TransactionBuilder, Umi } from "@metaplex-foundation/umi";
import { WalletAdapter } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { ReferralState } from "../generated";
import { TxHandler } from "./txHandler";
export interface ReferralStateManagerArgs {
    signer?: Signer;
    wallet?: WalletAdapter;
    authority?: PublicKey;
    referralState?: PublicKey;
    referredByAuthority?: PublicKey;
}
export declare class ReferralStateManager extends TxHandler {
    localTest?: boolean | undefined;
    umi: Umi;
    signer: Signer;
    referralState: PublicKey;
    referralStateData: ReferralState | null;
    authority: PublicKey;
    referredBy?: PublicKey;
    referredByState?: PublicKey;
    constructor(rpcUrl: string, localTest?: boolean | undefined);
    initialize(args: ReferralStateManagerArgs): Promise<void>;
    defaultLookupTables(): string[];
    setReferredBy(referredBy?: PublicKey): void;
    updateReferralStatesIx(destFeesMint?: PublicKey, lookupTable?: PublicKey): TransactionBuilder;
    claimReferralFeesIx(destFeesMint?: PublicKey): TransactionBuilder;
    resetLiveTxUpdates(success?: boolean): Promise<void>;
}
//# sourceMappingURL=referralStateManager.d.ts.map