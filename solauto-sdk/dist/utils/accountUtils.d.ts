import { PublicKey } from "@solana/web3.js";
export declare function bufferFromU8(num: number): Buffer;
export declare function bufferFromU64(num: bigint): Buffer;
export declare function getTokenAccount(wallet: PublicKey, tokenMint: PublicKey): PublicKey;
export declare function getTokenAccounts(wallet: PublicKey, tokenMints: PublicKey[]): PublicKey[];
export declare function getSolautoPositionAccount(signer: PublicKey, positionId: number): Promise<PublicKey>;
export declare function getReferralState(authority: PublicKey): Promise<PublicKey>;
export declare function getMarginfiAccountPDA(solautoPositionAccount: PublicKey, marginfiAccountSeedIdx: bigint): Promise<PublicKey>;
//# sourceMappingURL=accountUtils.d.ts.map