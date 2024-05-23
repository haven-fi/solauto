import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { SolautoInfo, SolautoInfoArgs } from "./solautoInfo";
import { MarginfiTokenAccounts } from "../types";
import {
  MARGINFI_GROUP,
  MARGINFI_PROGRAM,
  findMarginfiAccountsByMint,
} from "../constants/marginfiAccounts";
import {
  LendingPlatform,
  MarginfiOpenPositionInstructionArgs,
  RebalanceDataArgs,
  SolautoActionArgs,
  marginfiOpenPosition,
  marginfiProtocolInteraction,
  marginfiRebalance,
} from "../generated";
import {
  getMarginfiAccountPDA,
  getSolautoPositionAccount,
} from "../utils/accountUtils";
import {
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import {
  Signer,
  TransactionBuilder,
  isOption,
  publicKey,
} from "@metaplex-foundation/umi";

export interface SolautoMarginfiInfoArgs extends SolautoInfoArgs {
  marginfiAccount: PublicKey | Signer;
  marginfiAccountSeedIdx?: bigint;

  supplyMarginfiTokenAccounts: MarginfiTokenAccounts;
  debtMarginfiTokenAccounts: MarginfiTokenAccounts;
}

export class SolautoMarginfiInfo extends SolautoInfo {
  public marginfiProgram: PublicKey;

  public marginfiAccount: PublicKey | Signer;
  public marginfiAccountSeedIdx?: bigint;
  public marginfiGroup: PublicKey;

  public supplyMarginfiTokenAccounts?: MarginfiTokenAccounts;
  public debtMarginfiTokenAccounts?: MarginfiTokenAccounts;

  stringToUint8Array(str: string): Uint8Array {
    const arr = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      arr[i] = str.charCodeAt(i);
    }
    return arr;
  }

  async initialize(args: SolautoMarginfiInfoArgs) {
    this.marginfiAccountSeedIdx = args.marginfiAccountSeedIdx;
    this.marginfiGroup = new PublicKey(MARGINFI_GROUP);

    const solautoPosition =
      args.position.existingSolautoPosition?.pubkey ??
      (await getSolautoPositionAccount(
        toWeb3JsPublicKey(args.signer.publicKey),
        args.position.newPositionId
      ));
    this.marginfiAccount =
      this.marginfiAccountSeedIdx !== undefined
        ? await getMarginfiAccountPDA(
            solautoPosition,
            this.marginfiAccountSeedIdx
          )
        : undefined;

    if (
      args.position.existingSolautoPosition?.data?.position.__option === "Some"
    ) {
      this.supplyMarginfiTokenAccounts = findMarginfiAccountsByMint(
        args.position.existingSolautoPosition?.data?.position.value.protocolData
          .supplyMint
      )!;
      this.debtMarginfiTokenAccounts = findMarginfiAccountsByMint(
        args.position.existingSolautoPosition?.data?.position.value.protocolData
          .debtMint
      )!;
    } else {
      this.supplyMarginfiTokenAccounts = args.supplyMarginfiTokenAccounts;
      this.debtMarginfiTokenAccounts = args.debtMarginfiTokenAccounts;
    }

    args.supplyLiquidityMint = new PublicKey(
      this.supplyMarginfiTokenAccounts.mint
    );
    args.debtLiquidityMint = new PublicKey(this.debtMarginfiTokenAccounts.mint);

    await super.initialize(args, LendingPlatform.Marginfi);
  }

  marginfiOpenPosition(
    args: MarginfiOpenPositionInstructionArgs
  ): TransactionBuilder {
    let signerDebtLiquidityTa = undefined;
    if (
      isOption(args.positionData.activeDca) &&
      args.positionData.activeDca.__option === "Some" &&
      isOption(args.positionData.activeDca.value.addToPos) &&
      args.positionData.activeDca.value.addToPos.__option === "Some"
    ) {
      signerDebtLiquidityTa = publicKey(this.signerDebtLiquidityTa);
    }

    return marginfiOpenPosition(this.umi, {
      signer: this.signer,
      marginfiProgram: publicKey(MARGINFI_PROGRAM),
      solautoFeesWallet: publicKey(this.solautoFeesWallet),
      solautoFeesSupplyTa: publicKey(this.solautoFeesSupplyTa),
      signerReferralState: publicKey(this.authorityReferralState),
      referredByState: publicKey(this.referredByState),
      referredBySupplyTa: publicKey(this.referredBySupplyTa),
      solautoPosition: publicKey(this.solautoPosition),
      marginfiGroup: publicKey(this.marginfiGroup),
      marginfiAccount:
        this.marginfiAccountSeedIdx !== undefined
          ? publicKey(this.marginfiAccount)
          : (this.marginfiAccount as Signer),
      supplyMint: publicKey(this.supplyLiquidityMint),
      positionSupplyTa: publicKey(this.positionSupplyLiquidityTa),
      debtMint: publicKey(this.debtLiquidityMint),
      positionDebtTa: publicKey(this.positionDebtLiquidityTa),
      signerDebtTa: signerDebtLiquidityTa,
      positionData: args.positionData,
      marginfiAccountSeedIdx: args.marginfiAccountSeedIdx,
    });
  }

  marginfiProtocolInteraction(args: SolautoActionArgs): TransactionBuilder {
    let signerSupplyTa = undefined;
    let vaultSupplyTa = undefined;
    let supplyVaultAuthority = undefined;
    if (args.__kind === "Deposit" || args.__kind === "Withdraw") {
      signerSupplyTa = publicKey(this.signerSupplyLiquidityTa);
      vaultSupplyTa = publicKey(
        this.supplyMarginfiTokenAccounts.liquidityVault
      );
      supplyVaultAuthority = publicKey(
        this.supplyMarginfiTokenAccounts.vaultAuthority
      );
    }

    let signerDebtTa = undefined;
    let vaultDebtTa = undefined;
    let debtVaultAuthority = undefined;
    if (args.__kind === "Borrow" || args.__kind === "Repay") {
      signerDebtTa = publicKey(this.signerDebtLiquidityTa);
      vaultDebtTa = publicKey(this.debtMarginfiTokenAccounts.liquidityVault);
      debtVaultAuthority = publicKey(
        this.debtMarginfiTokenAccounts.vaultAuthority
      );
    }

    return marginfiProtocolInteraction(this.umi, {
      signer: this.signer,
      marginfiProgram: publicKey(MARGINFI_PROGRAM),
      solautoPosition: publicKey(this.solautoPosition),
      marginfiGroup: publicKey(this.marginfiGroup),
      marginfiAccount: publicKey(this.marginfiAccount),
      supplyBank: publicKey(this.supplyMarginfiTokenAccounts.bank),
      supplyPriceOracle: publicKey(
        this.supplyMarginfiTokenAccounts.priceOracle
      ),
      signerSupplyTa,
      vaultSupplyTa,
      supplyVaultAuthority,
      debtBank: publicKey(this.debtMarginfiTokenAccounts.bank),
      debtPriceOracle: publicKey(this.debtMarginfiTokenAccounts.priceOracle),
      signerDebtTa,
      vaultDebtTa,
      debtVaultAuthority,
      solautoAction: args,
    });
  }

  marginfiRebalance(
    intermediaryTa: PublicKey,
    args: RebalanceDataArgs
  ): TransactionBuilder {
    return marginfiRebalance(this.umi, {
      signer: this.signer,
      marginfiProgram: publicKey(MARGINFI_PROGRAM),
      ixsSysvar: publicKey(SYSVAR_INSTRUCTIONS_PUBKEY),
      solautoFeesSupplyTa: publicKey(this.solautoFeesSupplyTa),
      authorityReferralState: publicKey(this.authorityReferralState),
      referredBySupplyTa: publicKey(this.referredBySupplyTa),
      solautoPosition: publicKey(this.solautoPosition),
      marginfiGroup: publicKey(this.marginfiGroup),
      marginfiAccount: publicKey(this.marginfiAccount),
      intermediaryTa: publicKey(intermediaryTa),
      supplyBank: publicKey(this.supplyMarginfiTokenAccounts.bank),
      supplyPriceOracle: publicKey(
        this.supplyMarginfiTokenAccounts.priceOracle
      ),
      positionSupplyTa: publicKey(this.positionSupplyLiquidityTa),
      vaultSupplyTa: publicKey(this.supplyMarginfiTokenAccounts.liquidityVault),
      supplyVaultAuthority: publicKey(
        this.supplyMarginfiTokenAccounts.vaultAuthority
      ),
      debtBank: publicKey(this.debtMarginfiTokenAccounts.bank),
      debtPriceOracle: publicKey(this.debtMarginfiTokenAccounts.priceOracle),
      positionDebtTa: publicKey(this.positionDebtLiquidityTa),
      vaultDebtTa: publicKey(this.debtMarginfiTokenAccounts.liquidityVault),
      debtVaultAuthority: publicKey(
        this.debtMarginfiTokenAccounts.vaultAuthority
      ),
      rebalanceData: args,
    });
  }
}
