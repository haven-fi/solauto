import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import {
  Signer,
  TransactionBuilder,
  publicKey,
  PublicKey as UmiPublicKey,
  createSignerFromKeypair,
  AccountMeta,
} from "@metaplex-foundation/umi";
import {
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import { MarginfiAssetAccounts, RebalanceDetails } from "../../types";
import { getMarginfiAccounts, MarginfiProgramAccounts } from "../../constants";
import {
  DCASettingsInpArgs,
  LendingPlatform,
  PositionType,
  PriceType,
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
import {
  getAllMarginfiAccountsByAuthority,
  marginfiAccountEmpty,
  getTokenAccount,
  hasFirstRebalance,
  getRemainingAccountsForMarginfiHealthCheck,
  getAccountMeta,
  composeRemainingAccounts,
} from "../../utils";
import {
  Bank,
  fetchMarginfiAccount,
  lendingAccountBorrow,
  lendingAccountDeposit,
  lendingAccountRepay,
  lendingAccountWithdraw,
  marginfiAccountInitialize,
  safeFetchAllMarginfiAccount,
} from "../../externalSdks/marginfi";
import { SolautoClient, SolautoClientArgs } from "./solautoClient";

function isSigner(account: PublicKey | Signer): account is Signer {
  return "publicKey" in account;
}

export class SolautoMarginfiClient extends SolautoClient {
  public lendingPlatform = LendingPlatform.Marginfi;

  public mfiAccounts!: MarginfiProgramAccounts;

  public marginfiAccount!: PublicKey | Signer;
  public marginfiAccountPk!: PublicKey;
  public healthCheckRemainingAccounts!: AccountMeta[];
  public marginfiGroup!: PublicKey;

  public marginfiSupplyAccounts!: MarginfiAssetAccounts;
  public marginfiDebtAccounts!: MarginfiAssetAccounts;

  public supplyPriceOracle!: PublicKey;
  public debtPriceOracle!: PublicKey;

  async initialize(args: SolautoClientArgs) {
    await super.initialize(args);

    this.mfiAccounts = getMarginfiAccounts(this.lpEnv);

    this.marginfiGroup = this.pos.lpPoolAccount;
    this.healthCheckRemainingAccounts = [];

    if (this.pos.selfManaged) {
      this.marginfiAccount =
        args.lpUserAccount ??
        createSignerFromKeypair(this.umi, this.umi.eddsa.generateKeypair());
    } else {
      if (this.pos.exists) {
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

    this.marginfiAccountPk = isSigner(this.marginfiAccount)
      ? toWeb3JsPublicKey(this.marginfiAccount.publicKey)
      : this.marginfiAccount;

    if (isSigner(this.marginfiAccount)) {
      this.otherSigners.push(this.marginfiAccount);
    } else if (this.pos.selfManaged) {
      const accountData = await fetchMarginfiAccount(
        this.umi,
        fromWeb3JsPublicKey(this.marginfiAccount as PublicKey)
      );
      this.healthCheckRemainingAccounts = (
        await Promise.all(
          accountData.lendingAccount.balances.map((balance) =>
            getRemainingAccountsForMarginfiHealthCheck(this.umi, balance)
          )
        )
      ).flat();
    }

    this.marginfiSupplyAccounts =
      this.mfiAccounts.bankAccounts[this.marginfiGroup.toString()][
        this.pos.supplyMint.toString()
      ]!;
    this.marginfiDebtAccounts =
      this.mfiAccounts.bankAccounts[this.marginfiGroup.toString()][
        this.pos.debtMint.toString()
      ]!;

    [this.supplyPriceOracle, this.debtPriceOracle] =
      await this.pos.priceOracles();

    this.log("Marginfi account:", this.marginfiAccountPk.toString());
    this.log("Supply price oracle:", this.supplyPriceOracle.toString());
    this.log("Debt price oracle:", this.debtPriceOracle.toString());
  }

  defaultLookupTables(): string[] {
    return [
      this.mfiAccounts.lookupTable.toString(),
      ...super.defaultLookupTables(),
    ];
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
      marginfiProgram: publicKey(this.mfiAccounts.program),
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
      supplyMint: publicKey(this.pos.supplyMint),
      supplyBank: publicKey(this.marginfiSupplyAccounts.bank),
      positionSupplyTa: publicKey(this.positionSupplyTa),
      debtMint: publicKey(this.pos.debtMint),
      debtBank: publicKey(this.marginfiDebtAccounts.bank),
      positionDebtTa: publicKey(this.positionDebtTa),
      signerDebtTa: signerDebtTa,
      positionType: positionType ?? PositionType.Leverage,
      positionData: {
        positionId: this.pos.positionId,
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

  refreshIx(priceType?: PriceType): TransactionBuilder {
    return marginfiRefreshData(this.umi, {
      signer: this.signer,
      marginfiProgram: publicKey(this.mfiAccounts.program),
      marginfiGroup: publicKey(this.marginfiGroup),
      marginfiAccount: publicKey(this.marginfiAccount),
      supplyBank: publicKey(this.marginfiSupplyAccounts.bank),
      supplyPriceOracle: publicKey(this.supplyPriceOracle),
      debtBank: publicKey(this.marginfiDebtAccounts.bank),
      debtPriceOracle: publicKey(this.debtPriceOracle),
      solautoPosition: publicKey(this.pos.publicKey),
      priceType: priceType ?? PriceType.Realtime,
    });
  }

  protocolInteractionIx(args: SolautoActionArgs): TransactionBuilder {
    let tx = super.protocolInteractionIx(args);

    if (this.pos.selfManaged) {
      return tx.add(this.marginfiProtocolInteractionIx(args));
    } else {
      return tx.add(this.marginfiSolautoProtocolInteractionIx(args));
    }
  }

  private marginfiProtocolInteractionIx(args: SolautoActionArgs) {
    switch (args.__kind) {
      case "Deposit": {
        if (
          !this.healthCheckRemainingAccounts
            .map((x) => x.pubkey.toString())
            .includes(this.marginfiSupplyAccounts.bank)
        ) {
          this.healthCheckRemainingAccounts.push(
            ...[
              getAccountMeta(new PublicKey(this.marginfiSupplyAccounts.bank)),
              getAccountMeta(this.supplyPriceOracle),
            ]
          );
        }
        return lendingAccountDeposit(this.umi, {
          signer: this.signer,
          signerTokenAccount: publicKey(this.signerSupplyTa),
          marginfiAccount: publicKey(this.marginfiAccountPk),
          marginfiGroup: publicKey(this.marginfiGroup),
          bank: publicKey(this.marginfiSupplyAccounts.bank),
          bankLiquidityVault: publicKey(
            this.marginfiSupplyAccounts.liquidityVault
          ),
          amount: args.fields[0],
          depositUpToLimit: true,
        });
      }
      case "Borrow": {
        const remainingAccounts = this.healthCheckRemainingAccounts;
        if (
          !remainingAccounts.find(
            (x) =>
              x.pubkey.toString() === this.marginfiDebtAccounts.bank.toString()
          )
        ) {
          remainingAccounts.push(
            ...[
              getAccountMeta(new PublicKey(this.marginfiDebtAccounts.bank)),
              getAccountMeta(this.debtPriceOracle),
            ]
          );
        }

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
        }).addRemainingAccounts(composeRemainingAccounts(remainingAccounts));
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
        }).addRemainingAccounts(
          composeRemainingAccounts(this.healthCheckRemainingAccounts)
        );
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
        args.__kind === "Withdraw" || this.pos.selfManaged
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
        args.__kind === "Borrow" || this.pos.selfManaged
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
      marginfiProgram: publicKey(this.mfiAccounts.program),
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
    const preSwapRebalance = rebalanceStep === RebalanceStep.PreSwap;
    const postSwapRebalance = rebalanceStep === RebalanceStep.PostSwap;

    const isFirstRebalance =
      (preSwapRebalance && hasFirstRebalance(data.rebalanceType)) ||
      (postSwapRebalance &&
        data.rebalanceType === SolautoRebalanceType.FLSwapThenRebalance);

    const addAuthorityTas =
      this.pos.selfManaged || data.values.tokenBalanceChange !== undefined;

    return marginfiRebalance(this.umi, {
      signer: this.signer,
      marginfiProgram: publicKey(this.mfiAccounts.program),
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
        ? publicKey(getTokenAccount(this.authority, this.pos.supplyMint))
        : undefined,
      vaultSupplyTa: publicKey(this.marginfiSupplyAccounts.liquidityVault),
      supplyVaultAuthority: publicKey(
        this.marginfiSupplyAccounts.vaultAuthority
      ),
      debtBank: publicKey(this.marginfiDebtAccounts.bank),
      debtPriceOracle: publicKey(this.debtPriceOracle),
      positionDebtTa: publicKey(this.positionDebtTa),
      authorityDebtTa: addAuthorityTas
        ? publicKey(getTokenAccount(this.authority, this.pos.debtMint))
        : undefined,
      vaultDebtTa: publicKey(this.marginfiDebtAccounts.liquidityVault),
      debtVaultAuthority: publicKey(this.marginfiDebtAccounts.vaultAuthority),
      rebalanceType: data.rebalanceType,
      targetLiqUtilizationRateBps: data.targetLiqUtilizationRateBps ?? null,
      swapInAmountBaseUnit: isFirstRebalance
        ? parseInt(data.swapQuote.inAmount)
        : null,
      swapType:
        data.swapQuote.swapMode === "ExactOut" && isFirstRebalance
          ? SwapType.ExactOut
          : null,
      priceType: isFirstRebalance ? data.priceType : null,
      flashLoanFeeBps:
        data.flashLoan?.flFeeBps && isFirstRebalance
          ? data.flashLoan.flFeeBps
          : null,
    });
  }
}
