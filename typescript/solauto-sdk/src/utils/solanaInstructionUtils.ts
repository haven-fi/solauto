import { Signer, WrappedInstruction } from "@metaplex-foundation/umi";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import {
  fromWeb3JsInstruction,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import { getTokenAccount } from "./accountUtils";

export function requestComputeUnitLimitUmiIx(
  signer: Signer,
  maxComputeUnits: number
) {
  return {
    instruction: fromWeb3JsInstruction(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: maxComputeUnits,
      })
    ),
    signers: [signer],
    bytesCreatedOnChain: 0,
  };
}

export function createAssociatedTokenAccountUmiIx(
  signer: Signer,
  wallet: PublicKey,
  mint: PublicKey
): WrappedInstruction {
  return {
    instruction: fromWeb3JsInstruction(
      createAssociatedTokenAccountInstruction(
        toWeb3JsPublicKey(signer.publicKey),
        getTokenAccount(wallet, mint),
        wallet,
        mint
      )
    ),
    signers: [signer],
    bytesCreatedOnChain: 0,
  };
}

export function systemTransferUmiIx(
  signer: Signer,
  destination: PublicKey,
  lamports: bigint
): WrappedInstruction {
  return {
    instruction: fromWeb3JsInstruction(
      SystemProgram.transfer({
        fromPubkey: toWeb3JsPublicKey(signer.publicKey),
        toPubkey: destination,
        lamports,
      })
    ),
    signers: [signer],
    bytesCreatedOnChain: 0,
  };
}

export function closeTokenAccountUmiIx(
  signer: Signer,
  tokenAccount: PublicKey,
  authority: PublicKey
): WrappedInstruction {
  return {
    instruction: fromWeb3JsInstruction(
      createCloseAccountInstruction(tokenAccount, authority, authority)
    ),
    signers: [signer],
    bytesCreatedOnChain: 0,
  };
}

export function splTokenTransferUmiIx(
  signer: Signer,
  fromTa: PublicKey,
  toTa: PublicKey,
  authority: PublicKey,
  amount: bigint
): WrappedInstruction {
  return {
    instruction: fromWeb3JsInstruction(
      createTransferInstruction(fromTa, toTa, authority, amount)
    ),
    signers: [signer],
    bytesCreatedOnChain: 0,
  };
}
