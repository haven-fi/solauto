import { PublicKey } from "@solana/web3.js";
import { Signer, TransactionBuilder, Umi } from "@metaplex-foundation/umi";
import { WalletAdapter } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { ReferralState } from "../generated";
interface ReferralStateManagerArgs {
    referralAuthority?: PublicKey;
    signer?: Signer;
    wallet?: WalletAdapter;
}
export declare class ReferralStateManager {
    umi: Umi;
    signer: Signer;
    referralAuthority: PublicKey;
    referralState: PublicKey;
    referralStateData: ReferralState | null;
    constructor(heliusApiKey: string);
    initialize(args: ReferralStateManagerArgs): Promise<void>;
    updateReferralStatesIx(destFeesMint?: PublicKey, referredBy?: PublicKey, lookupTable?: PublicKey): TransactionBuilder;
    claimReferralFeesIx(destFeesMint?: PublicKey): TransactionBuilder;
}
export {};
//# sourceMappingURL=referralStateManager.d.ts.map