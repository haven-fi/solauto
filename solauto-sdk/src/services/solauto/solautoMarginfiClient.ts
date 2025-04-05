import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import {
  Signer,
  TransactionBuilder,
  publicKey,
  PublicKey as UmiPublicKey,
  createSignerFromKeypair,
} from "@metaplex-foundation/umi";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { SolautoClient, SolautoClientArgs } from "./solautoClient";
import { MarginfiAssetAccounts } from "../../types/accounts";
import {
  MARGINFI_ACCOUNTS,
  MARGINFI_ACCOUNTS_LOOKUP_TABLE,
} from "../../constants/marginfiAccounts";
import {
  DCASettingsInpArgs,
  LendingPlatform,
  PositionType,
  RebalanceDirection,
  RebalanceStep,
  SolautoActionArgs,
  SolautoRebalanceType,
  SolautoSettingsParametersInpArgs,
  SwapType,
  closePosition,
  marginfiOpenPosition,
  marginfiProtocolInteraction,
  marginfiRebalance,
  marginfiRefreshData,
} from "../../generated";
import { getTokenAccount } from "../../utils/accountUtils";
import {
  MARGINFI_PROGRAM_ID,
  lendingAccountBorrow,
  lendingAccountDeposit,
  lendingAccountRepay,
  lendingAccountWithdraw,
  marginfiAccountInitialize,
  safeFetchAllMarginfiAccount,
} from "../../marginfi-sdk";
import {
  getAllMarginfiAccountsByAuthority,
  marginfiAccountEmpty,
} from "../../utils/marginfiUtils";
import { hasFirstRebalance } from "../../utils/solautoUtils";
import { RebalanceDetails } from "../../types";

export interface SolautoMarginfiClientArgs extends SolautoClientArgs {
  marginfiAccount?: PublicKey | Signer;
  marginfiAccountSeedIdx?: bigint;
}

export class SolautoMarginfiClient extends SolautoClient {
  public lendingPlatform = LendingPlatform.Marginfi;

  public marginfiProgram!: PublicKey;

  public marginfiAccount!: PublicKey | Signer;
  public marginfiAccountPk!: PublicKey;
  public marginfiGroup!: PublicKey;

  public marginfiSupplyAccounts!: MarginfiAssetAccounts;
  public marginfiDebtAccounts!: MarginfiAssetAccounts;

  public supplyPriceOracle!: PublicKey;
  public debtPriceOracle!: PublicKey;

  async initialize(args: SolautoMarginfiClientArgs) {
    await super.initialize(args);

    this.marginfiGroup = await this.pos.lendingPool();

    if (this.selfManaged) {
      this.marginfiAccount =
        args.marginfiAccount ??
        createSignerFromKeypair(this.umi, this.umi.eddsa.generateKeypair());
    } else {
      if (this.pos.exists()) {
        this.marginfiAccount = this.pos.lpUserAccount!;
      } else {
        const accounts = await getAllMarginfiAccountsByAuthority(
          this.umi,
          this.pos.publicKey,
          this.marginfiGroup,
          false
        );
        const reusableAccounts =
          accounts.length > 0
            ? (
                await safeFetchAllMarginfiAccount(
                  this.umi,
                  accounts.map((x) => publicKey(x.marginfiAccount))
                )
              ).filter((x) => marginfiAccountEmpty(x))
            : [];
        this.marginfiAccount =
          reusableAccounts.length > 0
            ? toWeb3JsPublicKey(reusableAccounts[0].publicKey)
            : createSignerFromKeypair(
                this.umi,
                this.umi.eddsa.generateKeypair()
              );
      }
    }
    this.marginfiAccountPk =
      "publicKey" in this.marginfiAccount
        ? toWeb3JsPublicKey(this.marginfiAccount.publicKey)
        : this.marginfiAccount;

    if ("publicKey" in this.marginfiAccount) {
      this.otherSigners.push(this.marginfiAccount);
    }

    this.marginfiSupplyAccounts =
      MARGINFI_ACCOUNTS[this.marginfiGroup.toString()][
        this.pos.supplyMint().toString()
      ]!;
    this.marginfiDebtAccounts =
      MARGINFI_ACCOUNTS[this.marginfiGroup.toString()][
        this.pos.debtMint().toString()
      ]!;

    // TODO: Don't dynamically pull oracle from bank until Marginfi sorts out their price oracle issues.
    // const [supplyBank, debtBank] = await safeFetchAllBank(this.umi, [
    //   publicKey(this.marginfiSupplyAccounts.bank),
    //   publicKey(this.marginfiDebtAccounts.bank),
    // ]);
    // this.supplyPriceOracle = toWeb3JsPublicKey(supplyBank.config.oracleKeys[0]);
    // this.debtPriceOracle = toWeb3JsPublicKey(debtBank.config.oracleKeys[0]);
    this.supplyPriceOracle = new PublicKey(
      this.marginfiSupplyAccounts.priceOracle
    );
    this.debtPriceOracle = new PublicKey(this.marginfiDebtAccounts.priceOracle);

    this.log("Marginfi account:", this.marginfiAccountPk.toString());
  }

  defaultLookupTables(): string[] {
    return [MARGINFI_ACCOUNTS_LOOKUP_TABLE, ...super.defaultLookupTables()];
  }

  lutAccountsToAdd(): PublicKey[] {
    return [...super.lutAccountsToAdd(), this.marginfiAccountPk];
  }

  marginfiAccountInitialize(marginfiAccount: Signer): TransactionBuilder {
    return marginfiAccountInitialize(this.umi, {
      marginfiAccount: marginfiAccount,
      marginfiGroup: publicKey(this.marginfiGroup),
      authority: this.signer,
      feePayer: this.signer,
    });
  }

  openPositionIx(
    settings?: SolautoSettingsParametersInpArgs,
    dca?: DCASettingsInpArgs
  ): TransactionBuilder {
    return super
      .openPositionIx(settings, dca)
      .add(this.marginfiOpenPositionIx(settings, dca));
  }

  private marginfiOpenPositionIx(
    settings?: SolautoSettingsParametersInpArgs,
    dca?: DCASettingsInpArgs,
    positionType?: PositionType
  ): TransactionBuilder {
    let signerDebtTa: UmiPublicKey | undefined = undefined;
    if (dca) {
      signerDebtTa = publicKey(this.signerDebtTa);
    }

    return marginfiOpenPosition(this.umi, {
      signer: this.signer,
      marginfiProgram: publicKey(MARGINFI_PROGRAM_ID),
      signerReferralState: publicKey(this.referralState),
      referredByState: this.referredByState
        ? publicKey(this.referredByState)
        : undefined,
      referredBySupplyTa: this.referredBySupplyTa()
        ? publicKey(this.referredBySupplyTa()!)
        : undefined,
      solautoPosition: publicKey(this.pos.publicKey),
      marginfiGroup: publicKey(this.marginfiGroup),
      marginfiAccount:
        "publicKey" in this.marginfiAccount
          ? (this.marginfiAccount as Signer)
          : publicKey(this.marginfiAccount),
      supplyMint: publicKey(this.pos.supplyMint()),
      supplyBank: publicKey(this.marginfiSupplyAccounts.bank),
      positionSupplyTa: publicKey(this.positionSupplyTa),
      debtMint: publicKey(this.pos.debtMint()),
      debtBank: publicKey(this.marginfiDebtAccounts.bank),
      positionDebtTa: publicKey(this.positionDebtTa),
      signerDebtTa: signerDebtTa,
      positionType: positionType ?? PositionType.Leverage,
      positionData: {
        positionId: this.positionId!,
        settings: settings ?? null,
        dca: dca ?? null,
      },
    });
  }

  closePositionIx(): TransactionBuilder {
    return closePosition(this.umi, {
      signer: this.signer,
      solautoPosition: publicKey(this.pos.publicKey),
      signerSupplyTa: publicKey(this.signerSupplyTa),
      positionSupplyTa: publicKey(this.positionSupplyTa),
      positionDebtTa: publicKey(this.positionDebtTa),
      signerDebtTa: publicKey(this.signerDebtTa),
      lpUserAccount: publicKey(this.marginfiAccountPk),
    });
  }

  refreshIx(): TransactionBuilder {
    return marginfiRefreshData(this.umi, {
      signer: this.signer,
      marginfiProgram: publicKey(MARGINFI_PROGRAM_ID),
      marginfiGroup: publicKey(this.marginfiGroup),
      marginfiAccount: publicKey(this.marginfiAccount),
      supplyBank: publicKey(this.marginfiSupplyAccounts.bank),
      supplyPriceOracle: publicKey(this.supplyPriceOracle),
      debtBank: publicKey(this.marginfiDebtAccounts.bank),
      debtPriceOracle: publicKey(this.debtPriceOracle),
      solautoPosition: publicKey(this.pos.publicKey),
    });
  }

  protocolInteractionIx(args: SolautoActionArgs): TransactionBuilder {
    let tx = super.protocolInteractionIx(args);

    if (this.selfManaged) {
      return tx.add(this.marginfiProtocolInteractionIx(args));
    } else {
      return tx.add(this.marginfiSolautoProtocolInteractionIx(args));
    }
  }

  private marginfiProtocolInteractionIx(args: SolautoActionArgs) {
    switch (args.__kind) {
      case "Deposit": {
        return lendingAccountDeposit(this.umi, {
          amount: args.fields[0],
          signer: this.signer,
          signerTokenAccount: publicKey(this.signerSupplyTa),
          marginfiAccount: publicKey(this.marginfiAccountPk),
          marginfiGroup: publicKey(this.marginfiGroup),
          bank: publicKey(this.marginfiSupplyAccounts.bank),
          bankLiquidityVault: publicKey(
            this.marginfiSupplyAccounts.liquidityVault
          ),
        });
      }
      case "Borrow": {
        return lendingAccountBorrow(this.umi, {
          amount: args.fields[0],
          signer: this.signer,
          destinationTokenAccount: publicKey(this.signerDebtTa),
          marginfiAccount: publicKey(this.marginfiAccountPk),
          marginfiGroup: publicKey(this.marginfiGroup),
          bank: publicKey(this.marginfiDebtAccounts.bank),
          bankLiquidityVault: publicKey(
            this.marginfiDebtAccounts.liquidityVault
          ),
          bankLiquidityVaultAuthority: publicKey(
            this.marginfiDebtAccounts.vaultAuthority
          ),
        });
      }
      case "Repay": {
        return lendingAccountRepay(this.umi, {
          amount:
            args.fields[0].__kind === "Some" ? args.fields[0].fields[0] : 0,
          repayAll: args.fields[0].__kind === "All" ? true : false,
          signer: this.signer,
          signerTokenAccount: publicKey(this.signerDebtTa),
          marginfiAccount: publicKey(this.marginfiAccountPk),
          marginfiGroup: publicKey(this.marginfiGroup),
          bank: publicKey(this.marginfiDebtAccounts.bank),
          bankLiquidityVault: publicKey(
            this.marginfiDebtAccounts.liquidityVault
          ),
        });
      }
      case "Withdraw": {
        return lendingAccountWithdraw(this.umi, {
          amount:
            args.fields[0].__kind === "Some" ? args.fields[0].fields[0] : 0,
          withdrawAll: args.fields[0].__kind === "All" ? true : false,
          signer: this.signer,
          destinationTokenAccount: publicKey(this.signerSupplyTa),
          marginfiAccount: publicKey(this.marginfiAccountPk),
          marginfiGroup: publicKey(this.marginfiGroup),
          bank: publicKey(this.marginfiSupplyAccounts.bank),
          bankLiquidityVault: publicKey(
            this.marginfiSupplyAccounts.liquidityVault
          ),
          bankLiquidityVaultAuthority: publicKey(
            this.marginfiSupplyAccounts.vaultAuthority
          ),
        });
      }
    }
  }

  private marginfiSolautoProtocolInteractionIx(
    args: SolautoActionArgs
  ): TransactionBuilder {
    let positionSupplyTa: UmiPublicKey | undefined = undefined;
    let vaultSupplyTa: UmiPublicKey | undefined = undefined;
    let supplyVaultAuthority: UmiPublicKey | undefined = undefined;
    if (args.__kind === "Deposit" || args.__kind === "Withdraw") {
      positionSupplyTa = publicKey(
        args.__kind === "Withdraw" || this.selfManaged
          ? this.signerSupplyTa
          : this.positionSupplyTa
      );
      vaultSupplyTa = publicKey(this.marginfiSupplyAccounts.liquidityVault);
      supplyVaultAuthority = publicKey(
        this.marginfiSupplyAccounts.vaultAuthority
      );
    }

    let positionDebtTa: UmiPublicKey | undefined = undefined;
    let vaultDebtTa: UmiPublicKey | undefined = undefined;
    let debtVaultAuthority: UmiPublicKey | undefined = undefined;
    if (args.__kind === "Borrow" || args.__kind === "Repay") {
      positionDebtTa = publicKey(
        args.__kind === "Borrow" || this.selfManaged
          ? this.signerDebtTa
          : this.positionDebtTa
      );
      vaultDebtTa = publicKey(this.marginfiDebtAccounts.liquidityVault);
      debtVaultAuthority = publicKey(this.marginfiDebtAccounts.vaultAuthority);
    }

    let supplyPriceOracle: UmiPublicKey | undefined = undefined;
    let debtPriceOracle: UmiPublicKey | undefined = undefined;
    if (args.__kind === "Withdraw" || args.__kind === "Borrow") {
      supplyPriceOracle = publicKey(this.supplyPriceOracle);
      debtPriceOracle = publicKey(this.debtPriceOracle);
    }

    return marginfiProtocolInteraction(this.umi, {
      signer: this.signer,
      marginfiProgram: publicKey(MARGINFI_PROGRAM_ID),
      solautoPosition: publicKey(this.pos.publicKey),
      marginfiGroup: publicKey(this.marginfiGroup),
      marginfiAccount: publicKey(this.marginfiAccountPk),
      supplyBank: publicKey(this.marginfiSupplyAccounts.bank),
      supplyPriceOracle,
      positionSupplyTa,
      vaultSupplyTa,
      supplyVaultAuthority,
      debtBank: publicKey(this.marginfiDebtAccounts.bank),
      debtPriceOracle,
      positionDebtTa,
      vaultDebtTa,
      debtVaultAuthority,
      solautoAction: args,
    });
  }

  rebalanceIx(
    rebalanceStep: RebalanceStep,
    data: RebalanceDetails
  ): TransactionBuilder {
    const inputIsSupply = new PublicKey(data.swapQuote.inputMint).equals(
      this.pos.supplyMint()
    );
    const outputIsSupply = new PublicKey(data.swapQuote.outputMint).equals(
      this.pos.supplyMint()
    );

    const preSwapRebalance = rebalanceStep === RebalanceStep.PreSwap;
    const postSwapRebalance = rebalanceStep === RebalanceStep.PostSwap;

    const needSupplyAccounts =
      (inputIsSupply && preSwapRebalance) ||
      (outputIsSupply && postSwapRebalance) ||
      (inputIsSupply && data.flashLoan !== undefined && postSwapRebalance);
    const needDebtAccounts =
      (!inputIsSupply && preSwapRebalance) ||
      (!outputIsSupply && postSwapRebalance) ||
      (!inputIsSupply && data.flashLoan !== undefined && postSwapRebalance);

    const isFirstRebalance =
      (preSwapRebalance && hasFirstRebalance(data.rebalanceType)) ||
      (postSwapRebalance &&
        data.rebalanceType === SolautoRebalanceType.FLSwapThenRebalance);

    const addAuthorityTas =
      this.selfManaged || data.values.tokenBalanceChange !== undefined;

    return marginfiRebalance(this.umi, {
      signer: this.signer,
      marginfiProgram: publicKey(MARGINFI_PROGRAM_ID),
      ixsSysvar: publicKey(SYSVAR_INSTRUCTIONS_PUBKEY),
      solautoFeesTa: publicKey(
        data.values.rebalanceDirection === RebalanceDirection.Boost
          ? this.solautoFeesSupplyTa
          : this.solautoFeesDebtTa
      ),
      authorityReferralState: publicKey(this.referralState),
      referredByTa: this.referredByState
        ? publicKey(
            data.values.rebalanceDirection === RebalanceDirection.Boost
              ? this.referredBySupplyTa()!
              : this.referredByDebtTa()!
          )
        : undefined,
      positionAuthority:
        data.values.tokenBalanceChange !== undefined
          ? publicKey(this.authority)
          : undefined,
      solautoPosition: publicKey(this.pos.publicKey),
      marginfiGroup: publicKey(this.marginfiGroup),
      marginfiAccount: publicKey(this.marginfiAccountPk),
      intermediaryTa: publicKey(
        getTokenAccount(
          toWeb3JsPublicKey(this.signer.publicKey),
          new PublicKey(data.swapQuote.inputMint)
        )
      ),
      supplyBank: publicKey(this.marginfiSupplyAccounts.bank),
      supplyPriceOracle: publicKey(this.supplyPriceOracle),
      positionSupplyTa: publicKey(this.positionSupplyTa),
      authoritySupplyTa: addAuthorityTas
        ? publicKey(
            getTokenAccount(this.authority, this.pos.supplyMint())
          )
        : undefined,
      vaultSupplyTa: needSupplyAccounts
        ? publicKey(this.marginfiSupplyAccounts.liquidityVault)
        : undefined,
      supplyVaultAuthority: needSupplyAccounts
        ? publicKey(this.marginfiSupplyAccounts.vaultAuthority)
        : undefined,
      debtBank: publicKey(this.marginfiDebtAccounts.bank),
      debtPriceOracle: publicKey(this.debtPriceOracle),
      positionDebtTa: publicKey(this.positionDebtTa),
      authorityDebtTa: addAuthorityTas
        ? publicKey(
            getTokenAccount(this.authority, this.pos.debtMint())
          )
        : undefined,
      vaultDebtTa: needDebtAccounts
        ? publicKey(this.marginfiDebtAccounts.liquidityVault)
        : undefined,
      debtVaultAuthority: needDebtAccounts
        ? publicKey(this.marginfiDebtAccounts.vaultAuthority)
        : undefined,
      rebalanceType: data.rebalanceType,
      targetLiqUtilizationRateBps: data.targetLiqUtilizationRateBps ?? null,
      swapInAmountBaseUnit: isFirstRebalance
        ? parseInt(data.swapQuote.inAmount)
        : null,
      swapType:
        data.swapQuote.swapMode === "ExactOut" && isFirstRebalance
          ? SwapType.ExactOut
          : null,
      flashLoanFeeBps:
        data.flashLoan?.flFeeBps && isFirstRebalance
          ? data.flashLoan.flFeeBps
          : null,
    });
  }
}
