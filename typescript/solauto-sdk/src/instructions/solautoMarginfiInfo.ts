import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { SolautoInfo, SolautoInfoArgs } from "./solautoInfo";
import { MarginfiTokenAccounts } from "../types";
import {
  MARGINFI_GROUP,
  MARGINFI_PROGRAM,
  findMarginfiBankAccountsByMint,
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
import { getMarginfiAccountPDA } from "../utils/accountUtils";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import {
  Signer,
  TransactionBuilder,
  publicKey,
  PublicKey as UmiPublicKey,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { generateRandomU64 } from "../utils/generalUtils";
import { splTokenTransferUmiIx } from "../utils/solanaInstructionUtils";

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
    positionId,
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

  public marginfiSupplyBankAccounts: MarginfiTokenAccounts;
  public marginfiDebtBankAccounts: MarginfiTokenAccounts;

  async initialize(args: SolautoMarginfiInfoArgs) {
    await super.initialize(args, LendingPlatform.Marginfi);

    this.marginfiAccountSeedIdx = args.marginfiAccountSeedIdx;
    this.marginfiGroup = new PublicKey(MARGINFI_GROUP);

    this.marginfiAccount =
      this.marginfiAccountSeedIdx !== undefined
        ? await getMarginfiAccountPDA(
            this.solautoPosition,
            this.marginfiAccountSeedIdx
          )
        : args.marginfiAccount!;

    this.marginfiSupplyBankAccounts = findMarginfiBankAccountsByMint(
      this.supplyLiquidityMint.toString()
    )!;
    this.marginfiDebtBankAccounts = findMarginfiBankAccountsByMint(
      this.debtLiquidityMint.toString()
    )!;
  }

  marginfiOpenPosition(
    settingParams?: SolautoSettingsParameters,
    activeDca?: DCASettings
  ): TransactionBuilder {
    let builder = transactionBuilder();
    if (this.positionId != 0 || this.solautoPositionData === null) {
      builder = builder.add(this.marginfiOpenPositionIx(settingParams, activeDca));
    }
    return builder;
  }

  private marginfiOpenPositionIx(
    settingParams?: SolautoSettingsParameters,
    activeDca?: DCASettings
  ): TransactionBuilder {
    let signerDebtLiquidityTa: UmiPublicKey | undefined = undefined;
    if (activeDca && activeDca.addToPos.__option === "Some") {
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
        settingParams: settingParams ?? null,
        activeDca: activeDca ?? null,
      },
      marginfiAccountSeedIdx: this.marginfiAccountSeedIdx ?? null,
    });
  }

  marginfiRefreshDataIx(): TransactionBuilder {
    return marginfiRefreshData(this.umi, {
      signer: this.signer,
      marginfiProgram: publicKey(MARGINFI_PROGRAM),
      marginfiGroup: publicKey(this.marginfiGroup),
      marginfiAccount: publicKey(this.marginfiAccount),
      supplyBank: publicKey(this.marginfiSupplyBankAccounts.bank),
      supplyPriceOracle: publicKey(
        this.marginfiSupplyBankAccounts.priceOracle
      ),
      debtBank: publicKey(this.marginfiDebtBankAccounts.bank),
      debtPriceOracle: publicKey(this.marginfiDebtBankAccounts.priceOracle),
      solautoPosition: publicKey(this.solautoPosition),
    });
  }

  marginfiProtocolInteraction(args: SolautoActionArgs): TransactionBuilder {
    let builder = transactionBuilder();

    if (args.__kind === "Deposit") {
      builder = builder.add(
        splTokenTransferUmiIx(
          this.signer,
          this.signerSupplyLiquidityTa,
          this.positionSupplyLiquidityTa,
          toWeb3JsPublicKey(this.signer.publicKey),
          BigInt(args.fields[0])
        )
      );
    } else if (args.__kind === "Repay" && args.fields[0].__kind === "Some") {
      builder = builder.add(
        splTokenTransferUmiIx(
          this.signer,
          this.signerDebtLiquidityTa,
          this.positionDebtLiquidityTa,
          toWeb3JsPublicKey(this.signer.publicKey),
          BigInt(args.fields[0].fields[0])
        )
      );
    }

    return builder.add(this.marginfiProtocolInteractionIx(args));
  }

  marginfiProtocolInteractionIx(args: SolautoActionArgs): TransactionBuilder {
    let signerSupplyTa: UmiPublicKey | undefined = undefined;
    let vaultSupplyTa: UmiPublicKey | undefined = undefined;
    let supplyVaultAuthority: UmiPublicKey | undefined = undefined;
    if (args.__kind === "Deposit" || args.__kind === "Withdraw") {
      signerSupplyTa = publicKey(this.positionSupplyLiquidityTa);
      vaultSupplyTa = publicKey(
        this.marginfiSupplyBankAccounts.liquidityVault
      );
      supplyVaultAuthority = publicKey(
        this.marginfiSupplyBankAccounts.vaultAuthority
      );
    }

    let signerDebtTa: UmiPublicKey | undefined = undefined;
    let vaultDebtTa: UmiPublicKey | undefined = undefined;
    let debtVaultAuthority: UmiPublicKey | undefined = undefined;
    if (args.__kind === "Borrow" || args.__kind === "Repay") {
      signerSupplyTa = publicKey(this.signerSupplyLiquidityTa);
      signerDebtTa = publicKey(this.signerDebtLiquidityTa);
      vaultDebtTa = publicKey(this.marginfiDebtBankAccounts.liquidityVault);
      debtVaultAuthority = publicKey(
        this.marginfiDebtBankAccounts.vaultAuthority
      );
    }

    return marginfiProtocolInteraction(this.umi, {
      signer: this.signer,
      marginfiProgram: publicKey(MARGINFI_PROGRAM),
      solautoPosition: publicKey(this.solautoPosition),
      marginfiGroup: publicKey(this.marginfiGroup),
      marginfiAccount: publicKey(this.marginfiAccount),
      supplyBank: publicKey(this.marginfiSupplyBankAccounts.bank),
      supplyPriceOracle: publicKey(
        this.marginfiSupplyBankAccounts.priceOracle
      ),
      signerSupplyTa,
      vaultSupplyTa,
      supplyVaultAuthority,
      debtBank: publicKey(this.marginfiDebtBankAccounts.bank),
      debtPriceOracle: publicKey(this.marginfiDebtBankAccounts.priceOracle),
      signerDebtTa,
      vaultDebtTa,
      debtVaultAuthority,
      solautoAction: args,
    });
  }

  marginfiRebalanceIx(
    intermediaryTa: PublicKey,
    args: RebalanceDataArgs
  ): TransactionBuilder {
    return marginfiRebalance(this.umi, {
      signer: this.signer,
      marginfiProgram: publicKey(MARGINFI_PROGRAM),
      ixsSysvar: publicKey(SYSVAR_INSTRUCTIONS_PUBKEY),
      solautoFeesSupplyTa: publicKey(this.solautoFeesSupplyTa),
      authorityReferralState: publicKey(this.authorityReferralState),
      referredBySupplyTa: this.referredBySupplyTa
        ? publicKey(this.referredBySupplyTa)
        : undefined,
      solautoPosition: publicKey(this.solautoPosition),
      marginfiGroup: publicKey(this.marginfiGroup),
      marginfiAccount: publicKey(this.marginfiAccount),
      intermediaryTa: publicKey(intermediaryTa),
      supplyBank: publicKey(this.marginfiSupplyBankAccounts.bank),
      supplyPriceOracle: publicKey(
        this.marginfiSupplyBankAccounts.priceOracle
      ),
      positionSupplyTa: publicKey(this.positionSupplyLiquidityTa),
      vaultSupplyTa: publicKey(this.marginfiSupplyBankAccounts.liquidityVault),
      supplyVaultAuthority: publicKey(
        this.marginfiSupplyBankAccounts.vaultAuthority
      ),
      debtBank: publicKey(this.marginfiDebtBankAccounts.bank),
      debtPriceOracle: publicKey(this.marginfiDebtBankAccounts.priceOracle),
      positionDebtTa: publicKey(this.positionDebtLiquidityTa),
      vaultDebtTa: publicKey(this.marginfiDebtBankAccounts.liquidityVault),
      debtVaultAuthority: publicKey(
        this.marginfiDebtBankAccounts.vaultAuthority
      ),
      rebalanceData: args,
    });
  }
}
