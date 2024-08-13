import { PublicKey } from "@solana/web3.js";
import { MaybeRpcAccount, Umi } from "@metaplex-foundation/umi";
export declare function generateRandomU8(): number;
export declare function generateRandomU64(): bigint;
export declare function currentUnixSeconds(): number;
export declare function getSolanaAccountCreated(umi: Umi, pk: PublicKey): Promise<boolean>;
export declare function rpcAccountCreated(account: MaybeRpcAccount): boolean;
export declare function arraysAreEqual(arrayA: number[], arrayB: number[]): boolean;
export declare function getTokenPrices(mints: PublicKey[]): Promise<number[]>;
export type ErrorsToThrow = Array<new (...args: any[]) => Error>;
export declare function retryWithExponentialBackoff<T>(fn: (attemptNum: number) => Promise<T>, retries?: number, delay?: number, errorsToThrow?: ErrorsToThrow): Promise<T>;
//# sourceMappingURL=generalUtils.d.ts.map