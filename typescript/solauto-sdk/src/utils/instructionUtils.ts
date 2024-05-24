import {
  Signer,
  TransactionBuilder,
  WrappedInstruction,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import {
  ComputeBudgetInstruction,
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  ACCOUNT_SIZE,
} from "@solana/spl-token";
import {
  fromWeb3JsInstruction,
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import { WSOL_MINT } from "../constants/generalAccounts";
import { SolautoActionArgs } from "../generated";
import { SolautoInfo } from "../instructions/solautoInfo";
import { getTokenAccount } from "./accountUtils";

function getusedWsolTokenAccount(
  info: SolautoInfo,
  args?: SolautoActionArgs,
  initiatingDcaIn?: bigint,
  cancellingDcaIn?: boolean
): PublicKey | undefined {
  const supplyIsWsol = info.supplyLiquidityMint.equals(WSOL_MINT);
  const debtIsWsol = info.debtLiquidityMint.equals(WSOL_MINT);
  if (!supplyIsWsol && !debtIsWsol) {
    return undefined;
  }

  const usingSupplyTa =
    args?.__kind === "Deposit" || args?.__kind === "Withdraw";
  const usingDebtTa =
    args?.__kind === "Borrow" ||
    args?.__kind === "Repay" ||
    initiatingDcaIn ||
    cancellingDcaIn;
  if (supplyIsWsol && usingSupplyTa) {
    return info.signerSupplyLiquidityTa;
  } else if (debtIsWsol && usingDebtTa) {
    return info.signerDebtLiquidityTa;
  } else {
    return undefined;
  }
}

export async function tokenAccountChoresBefore(
  info: SolautoInfo,
  solautoAction?: SolautoActionArgs,
  initiatingDcaIn?: bigint
): Promise<TransactionBuilder | undefined> {
  const wSolTokenAccount = getusedWsolTokenAccount(
    info,
    solautoAction,
    initiatingDcaIn,
    undefined
  );

  if (wSolTokenAccount) {
    let builder = transactionBuilder();
    const result = await info.umi.rpc.getAccount(
      fromWeb3JsPublicKey(wSolTokenAccount)
    );
    if (result.exists && result.data.length > 0) {
      builder = builder.add(
        closeTokenAccountUmiIx(
          info.signer,
          wSolTokenAccount,
          toWeb3JsPublicKey(info.signer.publicKey)
        )
      );
    }

    const lamports = (await info.umi.rpc.getRent(ACCOUNT_SIZE)).basisPoints;
    let amountToTransfer = lamports;
    if (solautoAction?.__kind === "Deposit") {
      const value = solautoAction.fields[0];
      amountToTransfer += typeof value === "bigint" ? value : BigInt(value);
    } else if (
      solautoAction?.__kind === "Repay" &&
      solautoAction.fields[0].__kind === "Some"
    ) {
      const value = solautoAction.fields[0].fields[0];
      amountToTransfer += typeof value === "bigint" ? value : BigInt(value);
    } else if (initiatingDcaIn) {
      amountToTransfer += initiatingDcaIn;
    } else {
      new Error("Could not find an amount to feed to the wSOL token account");
    }
    builder = builder.add(
      systemTransferUmiIx(info.signer, wSolTokenAccount, amountToTransfer)
    );

    builder = builder.add([
      createAssociatedTokenAccountUmiIx(
        info.signer,
        toWeb3JsPublicKey(info.signer.publicKey),
        WSOL_MINT
      ),
    ]);

    return builder;
  } else if (
    solautoAction?.__kind === "Withdraw" ||
    solautoAction?.__kind === "Borrow"
  ) {
    const tokenAccount =
      solautoAction?.__kind === "Withdraw"
        ? info.signerSupplyLiquidityTa
        : info.signerDebtLiquidityTa;
    const result = await info.umi.rpc.getAccount(
      fromWeb3JsPublicKey(tokenAccount)
    );
    if (!result.exists || result.data.length === 0) {
      return transactionBuilder().add(
        createAssociatedTokenAccountUmiIx(
          info.signer,
          toWeb3JsPublicKey(info.signer.publicKey),
          WSOL_MINT
        )
      );
    }
  }

  return undefined;
}

export function tokenAccountChoresAfter(
  info: SolautoInfo,
  solautoAction?: SolautoActionArgs,
  cancellingDcaIn?: boolean
): TransactionBuilder | undefined {
  const wSolTokenAccount = getusedWsolTokenAccount(
    info,
    solautoAction,
    undefined,
    cancellingDcaIn
  );
  if (wSolTokenAccount) {
    return transactionBuilder().add(
      closeTokenAccountUmiIx(
        info.signer,
        wSolTokenAccount,
        toWeb3JsPublicKey(info.signer.publicKey)
      )
    );
  }

  return undefined;
}

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
        WSOL_MINT
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
