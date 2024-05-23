import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { SolautoInfo, SolautoInfoArgs } from "./solautoInfo";
import { MarginfiTokenAccounts } from "../types";
import {
  MARGINFI_GROUP,
  MARGINFI_PROGRAM,
  findMarginfiAccountsByMint,
} from "../constants/marginfiAccounts";
import {
  DCASettings,
  LendingPlatform,
  RebalanceDataArgs,
  SolautoActionArgs,
  SolautoSettingsParameters,
  marginfiOpenPosition,
  marginfiProtocolInteraction,
  marginfiRebalance,
  marginfiRefreshData,
} from "../generated";
import {
  getMarginfiAccountPDA,
  getSolautoPositionAccount,
} from "../utils/accountUtils";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import {
  Signer,
  TransactionBuilder,
  publicKey,
  PublicKey as UmiPublicKey,
  OptionOrNullable,
  isOption,
} from "@metaplex-foundation/umi";
import { generateRandomU64 } from "../utils/generalUtils";

export interface SolautoMarginfiInfoArgs extends SolautoInfoArgs {
  marginfiAccount?: Signer;
  marginfiAccountSeedIdx?: bigint;
}

export function newMarginfiSolautoManagedPositionArgs(
  signer: Signer,
  positionId: number,
  supplyMint: PublicKey,
  debtMint: PublicKey,
  referredByAuthority: PublicKey
): SolautoMarginfiInfoArgs {
  return {
    signer,
    position: {
      newPositionId: positionId,
    },
    marginfiAccountSeedIdx: generateRandomU64(),
    supplyLiquidityMint: supplyMint,
    debtLiquidityMint: debtMint,
    referredByAuthority,
  };
}

export class SolautoMarginfiInfo extends SolautoInfo {
  public marginfiProgram: PublicKey;

  public marginfiAccount: PublicKey | Signer;
  public marginfiAccountSeedIdx?: bigint;
  public marginfiGroup: PublicKey;

  public supplyMarginfiTokenAccounts: MarginfiTokenAccounts;
  public debtMarginfiTokenAccounts: MarginfiTokenAccounts;

  async initialize(args: SolautoMarginfiInfoArgs) {
    this.marginfiAccountSeedIdx = args.marginfiAccountSeedIdx;
    this.marginfiGroup = new PublicKey(MARGINFI_GROUP);

    const solautoPosition =
      args.position.existingSolautoPosition?.pubkey ??
      (await getSolautoPositionAccount(
        toWeb3JsPublicKey(args.signer.publicKey),
        args.position.newPositionId ?? 0
      ));
    this.marginfiAccount =
      this.marginfiAccountSeedIdx !== undefined
        ? await getMarginfiAccountPDA(
            solautoPosition,
            this.marginfiAccountSeedIdx
          )
        : args.marginfiAccount!;

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
      this.supplyMarginfiTokenAccounts = findMarginfiAccountsByMint(
        args.supplyLiquidityMint!.toString()
      )!;
      this.debtMarginfiTokenAccounts = findMarginfiAccountsByMint(
        args.debtLiquidityMint!.toString()
      )!;
    }

    args.supplyLiquidityMint = new PublicKey(
      this.supplyMarginfiTokenAccounts!.mint
    );
    args.debtLiquidityMint = new PublicKey(
      this.debtMarginfiTokenAccounts!.mint
    );

    await super.initialize(args, LendingPlatform.Marginfi);
  }

  marginfiOpenPosition(
    settingParams: SolautoSettingsParameters,
    activeDca?: DCASettings
  ): TransactionBuilder {
    let signerDebtLiquidityTa: UmiPublicKey | undefined = undefined;
    if (
      activeDca &&
      activeDca.addToPos.__option === "Some"
    ) {
      signerDebtLiquidityTa = publicKey(this.signerDebtLiquidityTa);
    }

    return marginfiOpenPosition(this.umi, {
      signer: this.signer,
      marginfiProgram: publicKey(MARGINFI_PROGRAM),
      solautoFeesWallet: publicKey(this.solautoFeesWallet),
      solautoFeesSupplyTa: publicKey(this.solautoFeesSupplyTa),
      signerReferralState: publicKey(this.authorityReferralState),
      referredByState: this.referredByState
        ? publicKey(this.referredByState)
        : undefined,
      referredBySupplyTa: this.referredBySupplyTa
        ? publicKey(this.referredBySupplyTa)
        : undefined,
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
      positionData: {
        positionId: this.positionId,
        settingParams,
        activeDca: activeDca ?? null,
      },
      marginfiAccountSeedIdx: this.marginfiAccountSeedIdx ?? null,
    });
  }

  marginfiRefreshData(): TransactionBuilder {
    return marginfiRefreshData(this.umi, {
      signer: this.signer,
      marginfiProgram: publicKey(MARGINFI_PROGRAM),
      marginfiGroup: publicKey(this.marginfiGroup),
      marginfiAccount: publicKey(this.marginfiAccount),
      supplyBank: publicKey(this.supplyMarginfiTokenAccounts.bank),
      supplyPriceOracle: publicKey(
        this.supplyMarginfiTokenAccounts.priceOracle
      ),
      debtBank: publicKey(this.debtMarginfiTokenAccounts.bank),
      debtPriceOracle: publicKey(this.debtMarginfiTokenAccounts.priceOracle),
      solautoPosition: publicKey(this.solautoPosition),
    });
  }

  marginfiProtocolInteraction(args: SolautoActionArgs): TransactionBuilder {
    let signerSupplyTa: UmiPublicKey | undefined = undefined;
    let vaultSupplyTa: UmiPublicKey | undefined = undefined;
    let supplyVaultAuthority: UmiPublicKey | undefined = undefined;
    if (args.__kind === "Deposit" || args.__kind === "Withdraw") {
      signerSupplyTa = publicKey(this.signerSupplyLiquidityTa);
      vaultSupplyTa = publicKey(
        this.supplyMarginfiTokenAccounts.liquidityVault
      );
      supplyVaultAuthority = publicKey(
        this.supplyMarginfiTokenAccounts.vaultAuthority
      );
    }

    let signerDebtTa: UmiPublicKey | undefined = undefined;
    let vaultDebtTa: UmiPublicKey | undefined = undefined;
    let debtVaultAuthority: UmiPublicKey | undefined = undefined;
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
      referredBySupplyTa: this.referredBySupplyTa ? publicKey(this.referredBySupplyTa) : undefined,
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
