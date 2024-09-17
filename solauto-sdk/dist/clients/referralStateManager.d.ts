import { PublicKey } from "@solana/web3.js";
import { Signer, TransactionBuilder, Umi } from "@metaplex-foundation/umi";
import { WalletAdapter } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { ReferralState } from "../generated";
import { TxHandler } from "./txHandler";
interface ReferralStateManagerArgs {
    signer?: Signer;
    wallet?: WalletAdapter;
    referralAuthority?: PublicKey;
}
export declare class ReferralStateManager extends TxHandler {
    localTest?: boolean | undefined;
    umi: Umi;
    signer: Signer;
    referralAuthority: PublicKey;
    referralState: PublicKey;
    referralStateData: ReferralState | null;
    constructor(heliusApiKey: string, localTest?: boolean | undefined);
    initialize(args: ReferralStateManagerArgs): Promise<void>;
    defaultLookupTables(): string[];
    updateReferralStatesIx(destFeesMint?: PublicKey, referredBy?: PublicKey, lookupTable?: PublicKey): TransactionBuilder;
    claimReferralFeesIx(destFeesMint?: PublicKey): TransactionBuilder;
    resetLiveTxUpdates(success?: boolean): Promise<void>;
}
export {};
//# sourceMappingURL=referralStateManager.d.ts.map