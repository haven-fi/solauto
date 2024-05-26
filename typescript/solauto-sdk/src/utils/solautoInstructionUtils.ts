import {
  TransactionBuilder,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { PublicKey } from "@solana/web3.js";
import { ACCOUNT_SIZE } from "@solana/spl-token";
import {
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import { SolautoActionArgs } from "../generated";
import { SolautoInfo } from "../instructions/solautoInfo";
import { WSOL_MINT } from "../constants/tokenConstants";
import {
  closeTokenAccountUmiIx,
  createAssociatedTokenAccountUmiIx,
  requestComputeUnitLimitUmiIx,
  systemTransferUmiIx,
} from "./solanaInstructionUtils";

function getusedWsolTokenAccount(
  info: SolautoInfo,
  args?: SolautoActionArgs,
  initiatingDcaIn?: bigint,
  cancellingDcaIn?: boolean
): PublicKey | undefined {
  const supplyIsWsol = info.supplyLiquidityMint.equals(
    new PublicKey(WSOL_MINT)
  );
  const debtIsWsol = info.debtLiquidityMint.equals(new PublicKey(WSOL_MINT));
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

async function tokenAccountChoresBefore(
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
      console.log("CLOSING ACCOUNT");
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
      amountToTransfer += BigInt(solautoAction.fields[0]);
    } else if (
      solautoAction?.__kind === "Repay" &&
      solautoAction.fields[0].__kind === "Some"
    ) {
      amountToTransfer += BigInt(solautoAction.fields[0].fields[0]);
    } else if (initiatingDcaIn) {
      amountToTransfer += initiatingDcaIn;
    } else {
      new Error("Could not find an amount to feed to the wSOL token account");
    }
    builder = builder.add(
      systemTransferUmiIx(info.signer, wSolTokenAccount, amountToTransfer)
    );

    builder = builder.add(
      createAssociatedTokenAccountUmiIx(
        info.signer,
        toWeb3JsPublicKey(info.signer.publicKey),
        new PublicKey(WSOL_MINT)
      )
    );

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
          solautoAction?.__kind === "Withdraw"
            ? info.supplyLiquidityMint
            : info.debtLiquidityMint
        )
      );
    }
  }

  return undefined;
}

function tokenAccountChoresAfter(
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

export async function solautoUserInstruction(
  tx: TransactionBuilder,
  info: SolautoInfo,
  solautoAction?: SolautoActionArgs,
  initiatingDcaIn?: bigint,
  cancellingDcaIn?: boolean
): Promise<TransactionBuilder> {
  const beforeIx = await tokenAccountChoresBefore(
    info,
    solautoAction,
    initiatingDcaIn
  );
  if (beforeIx !== undefined) {
    tx = tx.prepend(beforeIx);
  }

  if (
    this.authorityReferralStateData === null ||
    (this.referredByState !== null &&
      this.authorityReferralStateData.referredByState.__option === "None")
  ) {
    tx = tx.prepend(this.updateReferralStatesIx());
  }

  const afterIx = tokenAccountChoresAfter(info, solautoAction, cancellingDcaIn);
  if (afterIx !== undefined) {
    tx = tx.add(afterIx);
  }

  // TODO optimize this
  tx = tx.prepend(requestComputeUnitLimitUmiIx(info.signer, 800000));

  return tx;
}
