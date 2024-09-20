import {
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import {
  Signer,
  TransactionBuilder,
  publicKey,
  PublicKey as UmiPublicKey,
  transactionBuilder,
  createSignerFromKeypair,
  AccountMeta,
} from "@metaplex-foundation/umi";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { SolautoClient, SolautoClientArgs } from "./solautoClient";
import { MarginfiAssetAccounts } from "../types/accounts";
import {
  DEFAULT_MARGINFI_GROUP,
  MARGINFI_ACCOUNTS,
  MARGINFI_ACCOUNTS_LOOKUP_TABLE,
} from "../constants/marginfiAccounts";
import {
  DCASettingsInpArgs,
  LendingPlatform,
  PositionState,
  SolautoActionArgs,
  SolautoRebalanceTypeArgs,
  SolautoSettingsParametersInpArgs,
  marginfiOpenPosition,
  marginfiProtocolInteraction,
  marginfiRebalance,
  marginfiRefreshData,
} from "../generated";
import { getMarginfiAccountPDA, getTokenAccount } from "../utils/accountUtils";
import { generateRandomU64 } from "../utils/generalUtils";
import {
  MARGINFI_PROGRAM_ID,
  MarginfiAccount,
  lendingAccountBorrow,
  lendingAccountDeposit,
  lendingAccountEndFlashloan,
  lendingAccountRepay,
  lendingAccountStartFlashloan,
  lendingAccountWithdraw,
  marginfiAccountInitialize,
  safeFetchAllMarginfiAccount,
  safeFetchMarginfiAccount,
} from "../marginfi-sdk";
import { JupSwapDetails } from "../utils/jupiterUtils";
import { FlashLoanDetails } from "../utils/solauto/rebalanceUtils";
import {
  findMarginfiAccounts,
  getAllMarginfiAccountsByAuthority,
  getMarginfiAccountPositionState,
  getMaxLtvAndLiqThreshold,
} from "../utils/marginfiUtils";
import { bytesToI80F48, fromBaseUnit, toBps } from "../utils/numberUtils";
import { PRICES, SOLAUTO_MANAGER } from "../constants";
import { createFakePositionState } from "../utils";

export interface SolautoMarginfiClientArgs extends SolautoClientArgs {
  marginfiAccount?: PublicKey | Signer;
  marginfiAccountSeedIdx?: bigint;
  marginfiGroup?: PublicKey;
}

export class SolautoMarginfiClient extends SolautoClient {
  private initialized: boolean = false;

  public marginfiProgram!: PublicKey;

  public marginfiAccountSeedIdx: bigint = BigInt(0);
  public marginfiAccount!: PublicKey | Signer;
  public marginfiAccountPk!: PublicKey;
  public marginfiGroup!: PublicKey;

  public marginfiSupplyAccounts!: MarginfiAssetAccounts;
  public marginfiDebtAccounts!: MarginfiAssetAccounts;

  public supplyPriceOracle!: PublicKey;
  public debtPriceOracle!: PublicKey;

  // For flash loans
  public intermediaryMarginfiAccountSigner?: Signer;
  public intermediaryMarginfiAccountPk!: PublicKey;
  public intermediaryMarginfiAccount?: MarginfiAccount;

  async initialize(args: SolautoMarginfiClientArgs) {
    await super.initialize(args, LendingPlatform.Marginfi);

    if (this.selfManaged) {
      this.marginfiAccount =
        args.marginfiAccount ??
        createSignerFromKeypair(this.umi, this.umi.eddsa.generateKeypair());
    } else {
      this.marginfiAccountSeedIdx = generateRandomU64();
      this.marginfiAccount = this.solautoPositionData
        ? toWeb3JsPublicKey(this.solautoPositionData.position.protocolAccount)
        : await getMarginfiAccountPDA(
            this.solautoPosition,
            this.marginfiAccountSeedIdx
          );
    }
    this.marginfiAccountPk =
      "publicKey" in this.marginfiAccount
        ? toWeb3JsPublicKey(this.marginfiAccount.publicKey)
        : this.marginfiAccount;

    const marginfiAccountData = await safeFetchMarginfiAccount(
      this.umi,
      publicKey(this.marginfiAccountPk)
    );
    this.marginfiGroup = marginfiAccountData
      ? toWeb3JsPublicKey(marginfiAccountData.group)
      : args.marginfiGroup ?? new PublicKey(DEFAULT_MARGINFI_GROUP);

    this.marginfiSupplyAccounts =
      MARGINFI_ACCOUNTS[this.supplyMint.toString()]!;
    this.marginfiDebtAccounts = MARGINFI_ACCOUNTS[this.debtMint.toString()]!;

    // TODO: Don't dynamically pull from bank until Marginfi sorts out their price oracle issues.
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

    if (!this.solautoPositionState) {
      const [maxLtv, liqThreshold] = await getMaxLtvAndLiqThreshold(
        this.umi,
        { mint: this.supplyMint },
        { mint: this.debtMint }
      );
      this.solautoPositionState = createFakePositionState(
        { mint: this.supplyMint },
        { mint: this.debtMint },
        toBps(maxLtv),
        toBps(liqThreshold)
      );
    }

    if (!this.initialized) {
      await this.setIntermediaryMarginfiDetails();
    }
    this.initialized = true;
  }

  async setIntermediaryMarginfiDetails() {
    const existingMarginfiAccounts = (
      await getAllMarginfiAccountsByAuthority(
        this.umi,
        toWeb3JsPublicKey(this.signer.publicKey),
        false
      )
    )
      .filter((x) => !x.marginfiAccount.equals(this.marginfiAccountPk))
      .sort((a, b) =>
        a.marginfiAccount.toString().localeCompare(b.marginfiAccount.toString())
      );
    const emptyMarginfiAccounts =
      existingMarginfiAccounts.length > 0
        ? (
            await safeFetchAllMarginfiAccount(
              this.umi,
              existingMarginfiAccounts.map((x) => publicKey(x.marginfiAccount))
            )
          ).filter(
            (x) =>
              x.lendingAccount.balances.find(
                (y) =>
                  y.bankPk.toString() !== PublicKey.default.toString() &&
                  (Math.round(bytesToI80F48(y.assetShares.value)) != 0 ||
                    Math.round(bytesToI80F48(y.liabilityShares.value)) != 0)
              ) === undefined
          )
        : [];

    this.intermediaryMarginfiAccountSigner =
      emptyMarginfiAccounts.length > 0
        ? undefined
        : createSignerFromKeypair(this.umi, this.umi.eddsa.generateKeypair());
    this.intermediaryMarginfiAccountPk =
      emptyMarginfiAccounts.length > 0
        ? toWeb3JsPublicKey(emptyMarginfiAccounts[0].publicKey)
        : toWeb3JsPublicKey(this.intermediaryMarginfiAccountSigner!.publicKey);
    this.intermediaryMarginfiAccount =
      emptyMarginfiAccounts.length > 0 ? emptyMarginfiAccounts[0] : undefined;
  }

  protocolAccount(): PublicKey {
    return this.marginfiAccountPk;
  }

  defaultLookupTables(): string[] {
    return [MARGINFI_ACCOUNTS_LOOKUP_TABLE, ...super.defaultLookupTables()];
  }

  lutAccountsToAdd(): PublicKey[] {
    return [
      ...super.lutAccountsToAdd(),
      this.marginfiAccountPk,
      ...(this.signer.publicKey.toString() === this.authority.toString()
        ? [this.intermediaryMarginfiAccountPk]
        : []),
    ];
  }

  marginfiAccountInitialize(): TransactionBuilder {
    return marginfiAccountInitialize(this.umi, {
      marginfiAccount: this.marginfiAccount as Signer,
      marginfiGroup: publicKey(this.marginfiGroup),
      authority: this.signer,
      feePayer: this.signer,
    });
  }

  openPosition(
    settingParams?: SolautoSettingsParametersInpArgs,
    dca?: DCASettingsInpArgs
  ): TransactionBuilder {
    return super
      .openPosition(settingParams, dca)
      .add(this.marginfiOpenPositionIx(settingParams, dca));
  }

  private marginfiOpenPositionIx(
    settingParams?: SolautoSettingsParametersInpArgs,
    dca?: DCASettingsInpArgs
  ): TransactionBuilder {
    let signerDebtTa: UmiPublicKey | undefined = undefined;
    if (dca) {
      signerDebtTa = publicKey(this.signerDebtTa);
    }

    return marginfiOpenPosition(this.umi, {
      signer: this.signer,
      marginfiProgram: publicKey(MARGINFI_PROGRAM_ID),
      solautoFeesWallet: publicKey(this.solautoFeesWallet),
      solautoFeesSupplyTa: publicKey(this.solautoFeesSupplyTa),
      signerReferralState: publicKey(this.referralStateManager.referralState),
      referredByState: this.referredByState
        ? publicKey(this.referredByState)
        : undefined,
      referredBySupplyTa: this.referredBySupplyTa
        ? publicKey(this.referredBySupplyTa)
        : undefined,
      solautoPosition: publicKey(this.solautoPosition),
      marginfiGroup: publicKey(this.marginfiGroup),
      marginfiAccount:
        "publicKey" in this.marginfiAccount
          ? (this.marginfiAccount as Signer)
          : publicKey(this.marginfiAccount),
      supplyMint: publicKey(this.supplyMint),
      supplyBank: publicKey(this.marginfiSupplyAccounts.bank),
      positionSupplyTa: publicKey(this.positionSupplyTa),
      debtMint: publicKey(this.debtMint),
      debtBank: publicKey(this.marginfiDebtAccounts.bank),
      positionDebtTa: publicKey(this.positionDebtTa),
      signerDebtTa: signerDebtTa,
      positionData: {
        positionId: this.positionId!,
        settingParams: settingParams ?? null,
        dca: dca ?? null,
      },
      marginfiAccountSeedIdx: !this.selfManaged
        ? this.marginfiAccountSeedIdx
        : null,
    });
  }

  refresh(): TransactionBuilder {
    return marginfiRefreshData(this.umi, {
      signer: this.signer,
      marginfiProgram: publicKey(MARGINFI_PROGRAM_ID),
      marginfiGroup: publicKey(this.marginfiGroup),
      marginfiAccount: publicKey(this.marginfiAccount),
      supplyBank: publicKey(this.marginfiSupplyAccounts.bank),
      supplyPriceOracle: publicKey(this.supplyPriceOracle),
      debtBank: publicKey(this.marginfiDebtAccounts.bank),
      debtPriceOracle: publicKey(this.debtPriceOracle),
      solautoPosition: publicKey(this.solautoPosition),
    });
  }

  protocolInteraction(args: SolautoActionArgs): TransactionBuilder {
    let tx = super.protocolInteraction(args);

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
      solautoPosition: publicKey(this.solautoPosition),
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

  rebalance(
    rebalanceStep: "A" | "B",
    swapDetails: JupSwapDetails,
    rebalanceType: SolautoRebalanceTypeArgs,
    slippageBps: number,
    flashLoan?: FlashLoanDetails,
    targetLiqUtilizationRateBps?: number,
    limitGapBps?: number,
  ): TransactionBuilder {
    const inputIsSupply = swapDetails.inputMint.equals(this.supplyMint);
    const outputIsSupply = swapDetails.outputMint.equals(this.supplyMint);
    const needSupplyAccounts =
      (inputIsSupply && rebalanceStep === "A") ||
      (outputIsSupply && rebalanceStep === "B") ||
      (inputIsSupply && flashLoan !== undefined && rebalanceStep == "B");
    const needDebtAccounts =
      (!inputIsSupply && rebalanceStep === "A") ||
      (!outputIsSupply && rebalanceStep === "B") ||
      (!inputIsSupply && flashLoan !== undefined && rebalanceStep == "B");

    return marginfiRebalance(this.umi, {
      signer: this.signer,
      marginfiProgram: publicKey(MARGINFI_PROGRAM_ID),
      ixsSysvar: publicKey(SYSVAR_INSTRUCTIONS_PUBKEY),
      solautoFeesSupplyTa:
        rebalanceStep === "B" ? publicKey(this.solautoFeesSupplyTa) : undefined,
      authorityReferralState: publicKey(this.referralStateManager.referralState),
      referredBySupplyTa: this.referredBySupplyTa
        ? publicKey(this.referredBySupplyTa)
        : undefined,
      solautoPosition: publicKey(this.solautoPosition),
      marginfiGroup: publicKey(this.marginfiGroup),
      marginfiAccount: publicKey(this.marginfiAccountPk),
      intermediaryTa: publicKey(
        getTokenAccount(
          toWeb3JsPublicKey(this.signer.publicKey),
          swapDetails.inputMint
        )
      ),
      supplyBank: publicKey(this.marginfiSupplyAccounts.bank),
      supplyPriceOracle: publicKey(this.supplyPriceOracle),
      positionSupplyTa: publicKey(this.positionSupplyTa),
      signerSupplyTa: this.selfManaged
        ? publicKey(this.signerSupplyTa)
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
      signerDebtTa: this.selfManaged ? publicKey(this.signerDebtTa) : undefined,
      vaultDebtTa: needDebtAccounts
        ? publicKey(this.marginfiDebtAccounts.liquidityVault)
        : undefined,
      debtVaultAuthority: needDebtAccounts
        ? publicKey(this.marginfiDebtAccounts.vaultAuthority)
        : undefined,
      rebalanceType,
      targetLiqUtilizationRateBps: targetLiqUtilizationRateBps ?? null,
      limitGapBps: limitGapBps ?? null,
      slippageBps: slippageBps ?? 0
    });
  }

  flashBorrow(
    flashLoanDetails: FlashLoanDetails,
    destinationTokenAccount: PublicKey
  ): TransactionBuilder {
    const bank = flashLoanDetails.mint.equals(this.supplyMint)
      ? this.marginfiSupplyAccounts
      : this.marginfiDebtAccounts;
    return transactionBuilder()
      .add(
        lendingAccountStartFlashloan(this.umi, {
          endIndex: 0, // We set this after building the transaction
          ixsSysvar: publicKey(SYSVAR_INSTRUCTIONS_PUBKEY),
          marginfiAccount: publicKey(this.intermediaryMarginfiAccountPk),
          signer: this.signer,
        })
      )
      .add(
        lendingAccountBorrow(this.umi, {
          amount: flashLoanDetails.baseUnitAmount,
          bank: publicKey(bank.bank),
          bankLiquidityVault: publicKey(bank.liquidityVault),
          bankLiquidityVaultAuthority: publicKey(bank.vaultAuthority),
          destinationTokenAccount: publicKey(destinationTokenAccount),
          marginfiAccount: publicKey(this.intermediaryMarginfiAccountPk),
          marginfiGroup: publicKey(DEFAULT_MARGINFI_GROUP),
          signer: this.signer,
        })
      );
  }

  flashRepay(flashLoanDetails: FlashLoanDetails): TransactionBuilder {
    const accounts = flashLoanDetails.mint.equals(this.supplyMint)
      ? { data: this.marginfiSupplyAccounts, oracle: this.supplyPriceOracle }
      : { data: this.marginfiDebtAccounts, oracle: this.debtPriceOracle };

    const remainingAccounts: AccountMeta[] = [];
    let includedFlashLoanToken = false;

    if (this.intermediaryMarginfiAccount) {
      this.intermediaryMarginfiAccount.lendingAccount.balances.forEach(
        async (x) => {
          if (x.active) {
            if (x.bankPk === accounts.data.bank) {
              includedFlashLoanToken = true;
            }

            // TODO: Don't dynamically pull from bank until Marginfi sorts out their price oracle issues.
            // const bankData = await safeFetchBank(this.umi, publicKey(accounts.data.bank));
            // const priceOracle = bankData!.config.oracleKeys[0];
            const priceOracle = publicKey(
              findMarginfiAccounts(toWeb3JsPublicKey(x.bankPk)).priceOracle
            );

            remainingAccounts.push(
              ...[
                {
                  pubkey: x.bankPk,
                  isSigner: false,
                  isWritable: false,
                },
                {
                  pubkey: priceOracle,
                  isSigner: false,
                  isWritable: false,
                },
              ]
            );
          }
        }
      );
    }
    if (!this.intermediaryMarginfiAccount || !includedFlashLoanToken) {
      remainingAccounts.push(
        ...[
          {
            pubkey: fromWeb3JsPublicKey(new PublicKey(accounts.data.bank)),
            isSigner: false,
            isWritable: false,
          },
          {
            pubkey: fromWeb3JsPublicKey(new PublicKey(accounts.oracle)),
            isSigner: false,
            isWritable: false,
          },
        ]
      );
    }

    return transactionBuilder()
      .add(
        lendingAccountRepay(this.umi, {
          amount: flashLoanDetails.baseUnitAmount,
          repayAll: null,
          bank: publicKey(accounts.data.bank),
          bankLiquidityVault: publicKey(accounts.data.liquidityVault),
          marginfiAccount: publicKey(this.intermediaryMarginfiAccountPk),
          marginfiGroup: publicKey(DEFAULT_MARGINFI_GROUP),
          signer: this.signer,
          signerTokenAccount: publicKey(
            getTokenAccount(
              toWeb3JsPublicKey(this.signer.publicKey),
              flashLoanDetails.mint
            )
          ),
        })
      )
      .add(
        lendingAccountEndFlashloan(this.umi, {
          marginfiAccount: publicKey(this.intermediaryMarginfiAccountPk),
          signer: this.signer,
        }).addRemainingAccounts(remainingAccounts)
      );
  }

  createIntermediaryMarginfiAccount(): TransactionBuilder {
    return marginfiAccountInitialize(this.umi, {
      marginfiAccount: this.intermediaryMarginfiAccountSigner!,
      marginfiGroup: publicKey(DEFAULT_MARGINFI_GROUP),
      authority: this.signer,
      feePayer: this.signer,
    });
  }

  async getFreshPositionState(): Promise<PositionState | undefined> {
    const state = await super.getFreshPositionState();
    if (state) {
      return state;
    }

    const freshState = await getMarginfiAccountPositionState(
      this.umi,
      this.marginfiAccountPk,
      this.supplyMint,
      this.debtMint,
      this.livePositionUpdates
    );

    if (freshState) {
      this.log("Fresh state", freshState);
      const supplyPrice = PRICES[(freshState?.supply.mint ?? PublicKey.default).toString()].price;
      const debtPrice = PRICES[(freshState?.debt.mint ?? PublicKey.default).toString()].price;
      this.log("Supply price: ", supplyPrice);
      this.log("Debt price: ", debtPrice);
      this.log("Liq threshold bps:", freshState.liqThresholdBps);
      this.log("Liq utilization rate bps:", freshState.liqUtilizationRateBps);
      this.log("Supply USD:", fromBaseUnit(freshState.supply.amountUsed.baseUnit, freshState.supply.decimals) * supplyPrice);
      this.log("Debt USD:", fromBaseUnit(freshState.debt.amountUsed.baseUnit, freshState.debt.decimals) * debtPrice);
    }

    return freshState;
  }
}
