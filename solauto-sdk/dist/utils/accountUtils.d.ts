import { PublicKey } from "@solana/web3.js";
import { Umi } from "@metaplex-foundation/umi";
export declare function bufferFromU8(num: number): Buffer;
export declare function bufferFromU64(num: bigint): Buffer;
export declare function getTokenAccount(wallet: PublicKey, tokenMint: PublicKey): PublicKey;
export declare function getTokenAccounts(wallet: PublicKey, tokenMints: PublicKey[]): PublicKey[];
export declare function getTokenAccountData(umi: Umi, tokenAccount: PublicKey): Promise<import("@solana/spl-token").RawAccount | undefined>;
export declare function getSolautoPositionAccount(signer: PublicKey, positionId: number, programId: PublicKey): PublicKey;
export declare function getReferralState(authority: PublicKey, programId: PublicKey): PublicKey;
export declare function getMarginfiAccountPDA(solautoPositionAccount: PublicKey, marginfiAccountSeedIdx: bigint, programId: PublicKey): PublicKey;
//# sourceMappingURL=accountUtils.d.ts.map