import { AddressLookupTableInput, Signer, TransactionBuilder, Umi, WrappedInstruction } from "@metaplex-foundation/umi";
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { PriorityFeeSetting, TransactionRunType } from "../types";
export declare function buildHeliusApiUrl(heliusApiKey: string): string;
export declare function buildIronforgeApiUrl(ironforgeApiKey: string): string;
export declare function getSolanaRpcConnection(rpcUrl: string, programId?: PublicKey): [Connection, Umi];
export declare function getWrappedInstruction(signer: Signer, ix: TransactionInstruction): WrappedInstruction;
export declare function setComputeUnitLimitUmiIx(signer: Signer, maxComputeUnits: number): WrappedInstruction;
export declare function setComputeUnitPriceUmiIx(signer: Signer, lamports: number): WrappedInstruction;
export declare function createAssociatedTokenAccountUmiIx(signer: Signer, wallet: PublicKey, mint: PublicKey): WrappedInstruction;
export declare function systemTransferUmiIx(signer: Signer, destination: PublicKey, lamports: bigint): WrappedInstruction;
export declare function closeTokenAccountUmiIx(signer: Signer, tokenAccount: PublicKey, authority: PublicKey): WrappedInstruction;
export declare function splTokenTransferUmiIx(signer: Signer, fromTa: PublicKey, toTa: PublicKey, authority: PublicKey, amount: bigint): WrappedInstruction;
export declare function getAddressLookupInputs(umi: Umi, lookupTableAddresses: string[]): Promise<AddressLookupTableInput[]>;
export declare function assembleFinalTransaction(signer: Signer, tx: TransactionBuilder, computeUnitPrice?: number, computeUnitLimit?: number): TransactionBuilder;
export declare function getComputeUnitPriceEstimate(umi: Umi, tx: TransactionBuilder, prioritySetting: PriorityFeeSetting): Promise<number | undefined>;
export declare function sendSingleOptimizedTransaction(umi: Umi, connection: Connection, tx: TransactionBuilder, txType?: TransactionRunType, prioritySetting?: PriorityFeeSetting, onAwaitingSign?: () => void): Promise<Uint8Array | undefined>;
//# sourceMappingURL=solanaUtils.d.ts.map