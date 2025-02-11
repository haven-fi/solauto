import "rpc-websockets/dist/lib/client";
import { AddressLookupTableProgram, PublicKey } from "@solana/web3.js";
import {
  Signer,
  TransactionBuilder,
  isOption,
  publicKey,
  PublicKey as UmiPublicKey,
  isSome,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import {
  DCASettings,
  DCASettingsInpArgs,
  LendingPlatform,
  PositionState,
  SolautoActionArgs,
  SolautoPosition,
  SolautoRebalanceTypeArgs,
  SolautoSettingsParameters,
  SolautoSettingsParametersInpArgs,
  TokenType,
  UpdatePositionDataArgs,
  cancelDCA,
  closePosition,
  safeFetchSolautoPosition,
  updatePosition,
} from "../generated";
import {
  getSolautoPositionAccount,
  getTokenAccount,
} from "../utils/accountUtils";
import { SOLAUTO_FEES_WALLET } from "../constants/generalAccounts";
import {
  getWrappedInstruction,
  splTokenTransferUmiIx,
} from "../utils/solanaUtils";
import {
  FlashLoanDetails,
  RebalanceValues,
} from "../utils/solauto/rebalanceUtils";
import {
  MIN_POSITION_STATE_FRESHNESS_SECS,
  SOLAUTO_LUT,
} from "../constants/solautoConstants";
import { currentUnixSeconds } from "../utils/generalUtils";
import { LivePositionUpdates } from "../utils/solauto/generalUtils";
import {
  ReferralStateManager,
  ReferralStateManagerArgs,
} from "./referralStateManager";
import { QuoteResponse } from "@jup-ag/api";

export interface SolautoClientArgs extends ReferralStateManagerArgs {
  new?: boolean;
  positionId?: number;
  supplyMint?: PublicKey;
  debtMint?: PublicKey;
}

export abstract class SolautoClient extends ReferralStateManager {
  public lendingPlatform?: LendingPlatform;

  public authority!: PublicKey;

  public positionId!: number;
  public selfManaged!: boolean;
  public solautoPosition!: PublicKey;
  public solautoPositionData!: SolautoPosition | null;
  public solautoPositionState!: PositionState | undefined;

  public maxLtvBps?: number;
  public liqThresholdBps?: number;

  public supplyMint!: PublicKey;
  public positionSupplyTa!: PublicKey;
  public signerSupplyTa!: PublicKey;

  public debtMint!: PublicKey;
  public positionDebtTa!: PublicKey;
  public signerDebtTa!: PublicKey;

  public solautoFeesSupplyTa!: PublicKey;
  public solautoFeesDebtTa!: PublicKey;

  public authorityLutAddress?: PublicKey;

  public livePositionUpdates: LivePositionUpdates = new LivePositionUpdates();

  async initialize(args: SolautoClientArgs) {
    await super.initialize(args);

    this.positionId = args.positionId ?? 0;
    this.selfManaged = this.positionId === 0;
    this.solautoPosition = getSolautoPositionAccount(
      this.authority,
      this.positionId,
      this.programId
    );
    this.solautoPositionData = !args.new
      ? await safeFetchSolautoPosition(
          this.umi,
          publicKey(this.solautoPosition),
          { commitment: "confirmed" }
        )
      : null;
    this.solautoPositionState = this.solautoPositionData?.state;

    this.maxLtvBps = undefined;
    this.liqThresholdBps = undefined;

    this.supplyMint =
      args.supplyMint ??
      (this.solautoPositionData && !this.selfManaged
        ? toWeb3JsPublicKey(this.solautoPositionData!.state.supply.mint)
        : PublicKey.default);
    this.positionSupplyTa = getTokenAccount(
      this.solautoPosition,
      this.supplyMint
    );
    this.signerSupplyTa = getTokenAccount(
      toWeb3JsPublicKey(this.signer.publicKey),
      this.supplyMint
    );

    this.debtMint =
      args.debtMint ??
      (this.solautoPositionData && !this.selfManaged
        ? toWeb3JsPublicKey(this.solautoPositionData!.state.debt.mint)
        : PublicKey.default);
    this.positionDebtTa = getTokenAccount(this.solautoPosition, this.debtMint);
    this.signerDebtTa = getTokenAccount(
      toWeb3JsPublicKey(this.signer.publicKey),
      this.debtMint
    );

    this.solautoFeesSupplyTa = getTokenAccount(
      SOLAUTO_FEES_WALLET,
      this.supplyMint
    );
    this.solautoFeesDebtTa = getTokenAccount(
      SOLAUTO_FEES_WALLET,
      this.debtMint
    );

    this.authorityLutAddress =
      this.referralStateData?.lookupTable &&
      !toWeb3JsPublicKey(this.referralStateData.lookupTable).equals(
        PublicKey.default
      )
        ? toWeb3JsPublicKey(this.referralStateData.lookupTable)
        : undefined;

    this.log("Position state: ", this.solautoPositionState);
    this.log(
      "Position settings: ",
      this.solautoPositionData?.position?.settingParams
    );
    this.log(
      "Position DCA: ",
      (this.solautoPositionData?.position?.dca?.automation?.targetPeriods ??
        0) > 0
        ? this.solautoPositionData?.position?.dca
        : undefined
    );
  }

  referredBySupplyTa(): PublicKey | undefined {
    if (this.referredByState !== undefined) {
      return getTokenAccount(this.referredByState, this.supplyMint);
    }
    return undefined;
  }

  referredByDebtTa(): PublicKey | undefined {
    if (this.referredByState !== undefined) {
      return getTokenAccount(this.referredByState, this.debtMint);
    }
    return undefined;
  }

  async resetLiveTxUpdates(success?: boolean) {
    if (success) {
      if (!this.solautoPositionData) {
        this.solautoPositionData = await safeFetchSolautoPosition(
          this.umi,
          publicKey(this.solautoPosition),
          { commitment: "confirmed" }
        );
      } else {
        if (this.livePositionUpdates.activeDca) {
          this.solautoPositionData.position.dca =
            this.livePositionUpdates.activeDca;
        }
        if (this.livePositionUpdates.settings) {
          this.solautoPositionData.position.settingParams =
            this.livePositionUpdates.settings;
        }
        // All other live position updates can be derived by getting a fresh position state, so we don't need to do anything else form livePositionUpdates
      }
    }
    this.livePositionUpdates.reset();
  }

  abstract protocolAccount(): PublicKey;

  defaultLookupTables(): string[] {
    return [
      SOLAUTO_LUT,
      ...(this.authorityLutAddress
        ? [this.authorityLutAddress.toString()]
        : []),
    ];
  }

  lutAccountsToAdd(): PublicKey[] {
    return [
      this.authority,
      ...(toWeb3JsPublicKey(this.signer.publicKey).equals(this.authority)
        ? [this.signerSupplyTa]
        : []),
      ...(toWeb3JsPublicKey(this.signer.publicKey).equals(this.authority)
        ? [this.signerDebtTa]
        : []),
      this.solautoPosition,
      this.positionSupplyTa,
      this.positionDebtTa,
      this.referralState,
      ...(this.referredBySupplyTa() ? [this.referredBySupplyTa()!] : []),
      ...(this.referredByDebtTa() ? [this.referredByDebtTa()!] : []),
    ];
  }

  async fetchExistingAuthorityLutAccounts(): Promise<PublicKey[]> {
    const lookupTable = this.authorityLutAddress
      ? await this.connection.getAddressLookupTable(this.authorityLutAddress)
      : null;
    if (!lookupTable || lookupTable?.value === null) {
      this.authorityLutAddress = undefined;
    }
    return lookupTable?.value?.state.addresses ?? [];
  }

  async updateLookupTable(): Promise<
    | {
        tx: TransactionBuilder;
        new: boolean;
        accountsToAdd: PublicKey[];
      }
    | undefined
  > {
    if (this.selfManaged) {
      return undefined;
    }

    const existingLutAccounts = await this.fetchExistingAuthorityLutAccounts();
    if (
      this.lutAccountsToAdd().every((element) =>
        existingLutAccounts
          .map((x) => x.toString().toLowerCase())
          .includes(element.toString().toLowerCase())
      )
    ) {
      return undefined;
    }

    let tx = transactionBuilder();

    if (this.authorityLutAddress === undefined) {
      const [createLookupTableInst, lookupTableAddress] =
        AddressLookupTableProgram.createLookupTable({
          authority: this.authority,
          payer: toWeb3JsPublicKey(this.signer.publicKey),
          recentSlot: await this.umi.rpc.getSlot({ commitment: "finalized" }),
        });
      this.authorityLutAddress = lookupTableAddress;
      tx = tx.add(getWrappedInstruction(this.signer, createLookupTableInst));
    }

    const accountsToAdd: PublicKey[] = this.lutAccountsToAdd().filter(
      (x) =>
        !existingLutAccounts
          .map((x) => x.toString().toLowerCase())
          .includes(x.toString().toLowerCase())
    );
    if (accountsToAdd.length === 0) {
      return undefined;
    }

    tx = tx.add(
      getWrappedInstruction(
        this.signer,
        AddressLookupTableProgram.extendLookupTable({
          payer: toWeb3JsPublicKey(this.signer.publicKey),
          authority: this.authority,
          lookupTable: this.authorityLutAddress,
          addresses: accountsToAdd,
        })
      )
    );

    this.log("Requires authority LUT update...");
    return {
      tx,
      new: existingLutAccounts.length === 0,
      accountsToAdd,
    };
  }

  solautoPositionSettings(): SolautoSettingsParameters | undefined {
    return (
      this.livePositionUpdates.settings ??
      this.solautoPositionData?.position.settingParams
    );
  }

  solautoPositionActiveDca(): DCASettings | undefined {
    return (
      this.livePositionUpdates.activeDca ??
      this.solautoPositionData?.position.dca
    );
  }

  async maxLtvAndLiqThresholdBps(): Promise<[number, number] | undefined> {
    if (this.maxLtvBps !== undefined && this.liqThresholdBps !== undefined) {
      return [this.maxLtvBps, this.liqThresholdBps];
    }
    return undefined;
  }

  openPosition(
    settingParams?: SolautoSettingsParametersInpArgs,
    dca?: DCASettingsInpArgs
  ): TransactionBuilder {
    if (dca && dca.dcaInBaseUnit > 0) {
      this.livePositionUpdates.new({
        type: "dcaInBalance",
        value: {
          amount: BigInt(dca.dcaInBaseUnit),
          tokenType: dca.tokenType,
        },
      });
    }
    if (settingParams) {
      this.livePositionUpdates.new({
        type: "settings",
        value: settingParams,
      });
    }
    if (dca) {
      this.livePositionUpdates.new({
        type: "dca",
        value: dca,
      });
    }

    return transactionBuilder();
  }

  updatePositionIx(args: UpdatePositionDataArgs): TransactionBuilder {
    let dcaMint: UmiPublicKey | undefined = undefined;
    let positionDcaTa: UmiPublicKey | undefined = undefined;
    let signerDcaTa: UmiPublicKey | undefined = undefined;
    if (isOption(args.dca) && isSome(args.dca)) {
      if (args.dca.value.tokenType === TokenType.Supply) {
        dcaMint = publicKey(this.supplyMint);
        positionDcaTa = publicKey(this.positionSupplyTa);
        signerDcaTa = publicKey(this.signerSupplyTa);
      } else {
        dcaMint = publicKey(this.debtMint);
        positionDcaTa = publicKey(this.positionDebtTa);
        signerDcaTa = publicKey(this.signerDebtTa);
      }

      let addingToPos = false;
      if (
        isOption(args.dca) &&
        isSome(args.dca) &&
        args.dca.value.dcaInBaseUnit > 0
      ) {
        this.livePositionUpdates.new({
          type: "dcaInBalance",
          value: {
            amount: BigInt(args.dca.value.dcaInBaseUnit),
            tokenType: args.dca.value.tokenType,
          },
        });
        addingToPos = true;
      }
    }

    if (isOption(args.settingParams) && isSome(args.settingParams)) {
      this.livePositionUpdates.new({
        type: "settings",
        value: args.settingParams.value,
      });
    }

    if (isOption(args.dca) && isSome(args.dca)) {
      this.livePositionUpdates.new({
        type: "dca",
        value: args.dca.value,
      });
    }

    return updatePosition(this.umi, {
      signer: this.signer,
      solautoPosition: publicKey(this.solautoPosition),
      dcaMint,
      positionDcaTa,
      signerDcaTa,
      updatePositionData: args,
    });
  }

  closePositionIx(): TransactionBuilder {
    return closePosition(this.umi, {
      signer: this.signer,
      solautoPosition: publicKey(this.solautoPosition),
      signerSupplyTa: publicKey(this.signerSupplyTa),
      positionSupplyTa: publicKey(this.positionSupplyTa),
      positionDebtTa: publicKey(this.positionDebtTa),
      signerDebtTa: publicKey(this.signerDebtTa),
      protocolAccount: publicKey(this.protocolAccount()),
    });
  }

  cancelDCAIx(): TransactionBuilder {
    let dcaMint: UmiPublicKey | undefined = undefined;
    let positionDcaTa: UmiPublicKey | undefined = undefined;
    let signerDcaTa: UmiPublicKey | undefined = undefined;

    const currDca = this.solautoPositionActiveDca()!;
    if (currDca.dcaInBaseUnit > 0) {
      if (currDca.tokenType === TokenType.Supply) {
        dcaMint = publicKey(this.supplyMint);
        positionDcaTa = publicKey(this.positionSupplyTa);
        signerDcaTa = publicKey(this.signerSupplyTa);
      } else {
        dcaMint = publicKey(this.debtMint);
        positionDcaTa = publicKey(this.positionDebtTa);
        signerDcaTa = publicKey(this.signerDebtTa);
      }

      this.livePositionUpdates.new({
        type: "cancellingDca",
        value: this.solautoPositionData!.position.dca.tokenType,
      });
    }

    return cancelDCA(this.umi, {
      signer: this.signer,
      solautoPosition: publicKey(this.solautoPosition),
      dcaMint,
      positionDcaTa,
      signerDcaTa,
    });
  }

  abstract refresh(): TransactionBuilder;

  protocolInteraction(args: SolautoActionArgs): TransactionBuilder {
    let tx = transactionBuilder();

    if (!this.selfManaged) {
      if (args.__kind === "Deposit") {
        tx = tx.add(
          splTokenTransferUmiIx(
            this.signer,
            this.signerSupplyTa,
            this.positionSupplyTa,
            toWeb3JsPublicKey(this.signer.publicKey),
            BigInt(args.fields[0])
          )
        );
      } else if (args.__kind === "Repay") {
        if (args.fields[0].__kind === "Some") {
          tx = tx.add(
            splTokenTransferUmiIx(
              this.signer,
              this.signerDebtTa,
              this.positionDebtTa,
              toWeb3JsPublicKey(this.signer.publicKey),
              BigInt(args.fields[0].fields[0])
            )
          );
        } else {
          tx = tx.add(
            splTokenTransferUmiIx(
              this.signer,
              this.signerDebtTa,
              this.positionDebtTa,
              toWeb3JsPublicKey(this.signer.publicKey),
              BigInt(
                Math.round(
                  Number(this.solautoPositionState!.debt.amountUsed.baseUnit) *
                    1.01
                )
              )
            )
          );
        }
      }
    }

    if (args.__kind === "Deposit") {
      this.livePositionUpdates.new({
        type: "supply",
        value: BigInt(args.fields[0]),
      });
    } else if (args.__kind === "Withdraw") {
      if (args.fields[0].__kind === "Some") {
        this.livePositionUpdates.new({
          type: "supply",
          value: BigInt(args.fields[0].fields[0]) * BigInt(-1),
        });
      } else {
        this.livePositionUpdates.new({
          type: "supply",
          value:
            (this.solautoPositionState?.supply.amountUsed.baseUnit ??
              BigInt(0)) * BigInt(-1),
        });
      }
    } else if (args.__kind === "Borrow") {
      this.livePositionUpdates.new({
        type: "debt",
        value: BigInt(args.fields[0]),
      });
    } else {
      if (args.fields[0].__kind === "Some") {
        this.livePositionUpdates.new({
          type: "debt",
          value: BigInt(args.fields[0].fields[0]) * BigInt(-1),
        });
      } else {
        this.livePositionUpdates.new({
          type: "debt",
          value:
            (this.solautoPositionState?.debt.amountUsed.baseUnit ?? BigInt(0)) *
            BigInt(-1),
        });
      }
    }

    return tx;
  }

  abstract flashBorrow(
    flashLoanDetails: FlashLoanDetails,
    destinationTokenAccount: PublicKey
  ): TransactionBuilder;

  abstract flashRepay(flashLoanDetails: FlashLoanDetails): TransactionBuilder;

  abstract rebalance(
    rebalanceStep: "A" | "B",
    jupQuote: QuoteResponse,
    rebalanceType: SolautoRebalanceTypeArgs,
    rebalanceValues: RebalanceValues,
    flashLoan?: FlashLoanDetails,
    targetLiqUtilizationRateBps?: number
  ): TransactionBuilder;

  async getFreshPositionState(): Promise<PositionState | undefined> {
    if (
      Boolean(this.solautoPositionData) &&
      Boolean(this.solautoPositionState) &&
      Number(this.solautoPositionState!.lastUpdated) >
        currentUnixSeconds() - MIN_POSITION_STATE_FRESHNESS_SECS &&
      !this.livePositionUpdates.hasUpdates()
    ) {
      return this.solautoPositionState;
    }

    return undefined;
  }

  abstract supplyLiquidityAvailable(): bigint;
  abstract supplyLiquidityDepositable(): bigint;
  abstract debtLiquidityAvailable(): bigint;
}
