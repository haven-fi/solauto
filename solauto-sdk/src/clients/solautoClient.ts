import "rpc-websockets/dist/lib/client";
import {
  AddressLookupTableProgram,
  Connection,
  PublicKey,
} from "@solana/web3.js";
import {
  Signer,
  TransactionBuilder,
  Umi,
  isOption,
  publicKey,
  PublicKey as UmiPublicKey,
  isSome,
  transactionBuilder,
  signerIdentity,
  some,
} from "@metaplex-foundation/umi";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import {
  WalletAdapter,
  walletAdapterIdentity,
} from "@metaplex-foundation/umi-signer-wallet-adapters";
import {
  DCASettings,
  DCASettingsInpArgs,
  LendingPlatform,
  PositionState,
  ReferralState,
  SolautoActionArgs,
  SolautoPosition,
  SolautoRebalanceTypeArgs,
  SolautoSettingsParameters,
  SolautoSettingsParametersInpArgs,
  UpdatePositionDataArgs,
  cancelDCA,
  claimReferralFees,
  closePosition,
  createSolautoProgram,
  safeFetchReferralState,
  safeFetchSolautoPosition,
  updatePosition,
  updateReferralStates,
} from "../generated";
import {
  getReferralState,
  getSolautoPositionAccount,
  getTokenAccount,
} from "../utils/accountUtils";
import {
  SOLAUTO_FEES_WALLET,
} from "../constants/generalAccounts";
import { JupSwapDetails } from "../utils/jupiterUtils";
import {
  getSolanaRpcConnection,
  getWrappedInstruction,
  splTokenTransferUmiIx,
} from "../utils/solanaUtils";
import { FlashLoanDetails } from "../utils/solauto/rebalanceUtils";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  MIN_POSITION_STATE_FRESHNESS_SECS,
  SOLAUTO_LUT,
} from "../constants/solautoConstants";
import { currentUnixSeconds } from "../utils/generalUtils";
import { LivePositionUpdates } from "../utils/solauto/generalUtils";

export interface SolautoClientArgs {
  authority?: PublicKey;
  positionId: number;
  signer?: Signer;
  wallet?: WalletAdapter;

  supplyMint?: PublicKey;
  debtMint?: PublicKey;

  referralFeesDestMint?: PublicKey;
  referredByAuthority?: PublicKey;
}

export abstract class SolautoClient {
  public umi!: Umi;
  public connection!: Connection;
  public lendingPlatform!: LendingPlatform;

  public authority!: PublicKey;
  public signer!: Signer;

  public positionId!: number;
  public selfManaged!: boolean;
  public solautoPosition!: PublicKey;
  public solautoPositionData!: SolautoPosition | null;
  public solautoPositionState!: PositionState | undefined;

  public supplyMint!: PublicKey;
  public positionSupplyTa!: PublicKey;
  public signerSupplyTa!: PublicKey;

  public debtMint!: PublicKey;
  public positionDebtTa!: PublicKey;
  public signerDebtTa!: PublicKey;

  public authorityReferralState!: PublicKey;
  public authorityReferralStateData!: ReferralState | null;
  public authorityReferralFeesDestMint!: PublicKey;
  public authorityReferralDestTa!: PublicKey;

  public referredByState?: PublicKey;
  public referredByAuthority?: PublicKey;
  public referredBySupplyTa?: PublicKey;

  public solautoFeesWallet!: PublicKey;
  public solautoFeesSupplyTa!: PublicKey;

  public authorityLutAddress?: PublicKey;
  public upToDateLutAccounts!: PublicKey[];

  public livePositionUpdates: LivePositionUpdates = new LivePositionUpdates();

  constructor(
    heliusApiKey: string,
    public localTest?: boolean
  ) {
    const [connection, umi] = getSolanaRpcConnection(heliusApiKey);
    this.connection = connection;
    this.umi = umi.use({
      install(umi) {
        umi.programs.add(createSolautoProgram(), false);
      },
    });
  }

  async initialize(args: SolautoClientArgs, lendingPlatform: LendingPlatform) {
    if (!args.signer && !args.wallet) {
      throw new Error("Signer or wallet must be provided");
    }
    this.umi = this.umi.use(
      args.signer
        ? signerIdentity(args.signer)
        : walletAdapterIdentity(args.wallet!, true)
    );

    this.signer = this.umi.identity;
    this.authority = args.authority ?? toWeb3JsPublicKey(this.signer.publicKey);

    this.positionId = args.positionId;
    this.selfManaged = this.positionId === 0;
    this.lendingPlatform = lendingPlatform;
    this.solautoPosition = await getSolautoPositionAccount(
      this.authority,
      this.positionId
    );
    this.solautoPositionData = await safeFetchSolautoPosition(
      this.umi,
      publicKey(this.solautoPosition)
    );
    this.solautoPositionState = this.solautoPositionData?.state;

    this.supplyMint =
      args.supplyMint ??
      toWeb3JsPublicKey(this.solautoPositionData!.position.supplyMint);
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
      toWeb3JsPublicKey(this.solautoPositionData!.position.debtMint);
    this.positionDebtTa = getTokenAccount(this.solautoPosition, this.debtMint);
    this.signerDebtTa = getTokenAccount(
      toWeb3JsPublicKey(this.signer.publicKey),
      this.debtMint
    );

    this.authorityReferralState = await getReferralState(this.authority);
    this.authorityReferralStateData = await safeFetchReferralState(
      this.umi,
      publicKey(this.authorityReferralState)
    );
    this.authorityReferralFeesDestMint = args.referralFeesDestMint
      ? args.referralFeesDestMint
      : this.authorityReferralStateData?.destFeesMint
        ? toWeb3JsPublicKey(this.authorityReferralStateData?.destFeesMint)
        : NATIVE_MINT;
    this.authorityReferralDestTa = getTokenAccount(
      this.authorityReferralState,
      this.authorityReferralFeesDestMint
    );

    const hasReferredBy =
      this.authorityReferralStateData &&
      this.authorityReferralStateData.referredByState !==
        publicKey(PublicKey.default);
    const referredByAuthority =
      !hasReferredBy &&
      args.referredByAuthority &&
      !args.referredByAuthority.equals(toWeb3JsPublicKey(this.signer.publicKey))
        ? args.referredByAuthority
        : undefined;
    this.referredByState = hasReferredBy
      ? toWeb3JsPublicKey(this.authorityReferralStateData!.referredByState)
      : referredByAuthority
        ? await getReferralState(referredByAuthority!)
        : undefined;
    this.referredByAuthority = referredByAuthority;
    if (this.referredByState !== undefined) {
      this.referredBySupplyTa = getTokenAccount(
        this.referredByState,
        this.supplyMint
      );
    }

    this.solautoFeesWallet = SOLAUTO_FEES_WALLET;
    this.solautoFeesSupplyTa = getTokenAccount(
      this.solautoFeesWallet,
      this.supplyMint
    );

    this.authorityLutAddress = this.authorityReferralStateData?.lookupTable
      ? toWeb3JsPublicKey(this.authorityReferralStateData?.lookupTable)
      : undefined;
    this.upToDateLutAccounts = toWeb3JsPublicKey(this.signer.publicKey).equals(
      this.authority
    )
      ? await this.fetchExistingAuthorityLutAccounts()
      : [];

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

  log(...args: any[]): void {
    if (this.localTest) {
      console.log(...args);
    }
  }

  async resetLivePositionUpdates() {
    if (!this.solautoPositionData) {
      this.solautoPositionData = await safeFetchSolautoPosition(
        this.umi,
        publicKey(this.solautoPosition)
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
    this.livePositionUpdates.reset();
  }

  defaultLookupTables(): string[] {
    return [SOLAUTO_LUT];
  }

  lutAccountsToAdd(): PublicKey[] {
    return [
      this.authority,
      ...(this.signer.publicKey.toString() === this.authority.toString()
        ? [this.signerSupplyTa]
        : []),
      ...(this.signer.publicKey.toString() === this.authority.toString()
        ? [this.signerDebtTa]
        : []),
      this.solautoPosition,
      this.positionSupplyTa,
      this.positionDebtTa,
      this.authorityReferralState,
      ...(this.referredBySupplyTa ? [this.referredBySupplyTa] : []),
    ];
  }

  async fetchExistingAuthorityLutAccounts(): Promise<PublicKey[]> {
    const lookupTable = this.authorityLutAddress
      ? await this.connection.getAddressLookupTable(this.authorityLutAddress)
      : null;
    if (lookupTable === null) {
      this.authorityLutAddress = undefined;
    }
    return lookupTable?.value?.state.addresses ?? [];
  }

  async updateLookupTable(): Promise<
    { updateLutTx: TransactionBuilder; needsToBeIsolated: boolean } | undefined
  > {
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
    this.upToDateLutAccounts = [...existingLutAccounts, ...accountsToAdd];

    if (accountsToAdd.length > 0) {
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
    }

    const addingReferredBy =
      accountsToAdd.length === 1 &&
      accountsToAdd[0].toString().toLowerCase() ===
        this.referredBySupplyTa?.toString().toLowerCase();

    if (tx.getInstructions().length > 0) {
      this.log("Updating authority lookup table...");
    }

    return { updateLutTx: tx, needsToBeIsolated: !addingReferredBy };
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

  updateReferralStatesIx(): TransactionBuilder {
    return updateReferralStates(this.umi, {
      signer: this.signer,
      signerReferralState: publicKey(this.authorityReferralState),
      referralFeesDestMint: publicKey(this.authorityReferralFeesDestMint),
      referredByState: this.referredByState
        ? publicKey(this.referredByState)
        : undefined,
      referredByAuthority: this.referredByAuthority
        ? publicKey(this.referredByAuthority)
        : undefined,
      addressLookupTable: this.authorityLutAddress
        ? some(publicKey(this.authorityLutAddress))
        : null,
    });
  }

  claimReferralFeesIx(): TransactionBuilder {
    const feesDestinationTa =
      this.authorityReferralFeesDestMint !== NATIVE_MINT
        ? publicKey(
            getTokenAccount(
              toWeb3JsPublicKey(this.signer.publicKey),
              this.authorityReferralFeesDestMint
            )
          )
        : undefined;
    return claimReferralFees(this.umi, {
      signer: this.signer,
      referralState: publicKey(this.authorityReferralState),
      referralFeesDestTa: publicKey(this.authorityReferralDestTa),
      referralFeesDestMint: publicKey(this.authorityReferralFeesDestMint),
      feesDestinationTa,
    });
  }

  openPosition(
    settingParams?: SolautoSettingsParametersInpArgs,
    dca?: DCASettingsInpArgs
  ): TransactionBuilder {
    if (dca && dca.debtToAddBaseUnit > 0) {
      this.livePositionUpdates.new({
        type: "debtDcaIn",
        value: BigInt(dca.debtToAddBaseUnit),
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
    let debtMint: UmiPublicKey | undefined = undefined;
    let positionDebtTa: UmiPublicKey | undefined = undefined;
    let signerDebtTa: UmiPublicKey | undefined = undefined;
    if (isOption(args.dca) && isSome(args.dca)) {
      debtMint = publicKey(this.debtMint);
      positionDebtTa = publicKey(this.positionDebtTa);
      signerDebtTa = publicKey(this.signerDebtTa);

      let addingToPos = false;
      if (
        isOption(args.dca) &&
        isSome(args.dca) &&
        args.dca.value.debtToAddBaseUnit > 0
      ) {
        this.livePositionUpdates.new({
          type: "debtDcaIn",
          value: BigInt(args.dca.value.debtToAddBaseUnit),
        });
        addingToPos = true;
      }

      if (
        this.solautoPositionData?.position.dca.debtToAddBaseUnit &&
        !addingToPos
      ) {
        this.livePositionUpdates.new({
          type: "debtDcaIn",
          value:
            this.solautoPositionData.position.dca.debtToAddBaseUnit *
            BigInt(-1),
        });
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
      debtMint,
      positionDebtTa,
      signerDebtTa,
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
    });
  }

  cancelDCAIx(): TransactionBuilder {
    let debtMint: UmiPublicKey | undefined = undefined;
    let positionDebtTa: UmiPublicKey | undefined = undefined;
    let signerDebtTa: UmiPublicKey | undefined = undefined;

    if (this.solautoPositionData !== null && !this.selfManaged) {
      const positionData = this.solautoPositionData!.position;
      if (positionData.dca.debtToAddBaseUnit) {
        debtMint = publicKey(this.debtMint);
        positionDebtTa = publicKey(this.positionDebtTa);
        signerDebtTa = publicKey(this.signerDebtTa);

        this.livePositionUpdates.new({
          type: "debtDcaIn",
          value: positionData.dca.debtToAddBaseUnit * BigInt(-1),
        });
      }
    }

    return cancelDCA(this.umi, {
      signer: this.signer,
      solautoPosition: publicKey(this.solautoPosition),
      debtMint,
      positionDebtTa,
      signerDebtTa,
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
              BigInt(0)) + this.livePositionUpdates.supplyAdjustment,
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
            (this.solautoPositionState?.debt.amountUsed.baseUnit ?? BigInt(0)) +
            this.livePositionUpdates.debtAdjustment,
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
    swapDetails: JupSwapDetails,
    rebalanceType: SolautoRebalanceTypeArgs,
    flashLoan?: FlashLoanDetails,
    targetLiqUtilizationRateBps?: number,
    limitGapBps?: number
  ): TransactionBuilder;

  async getFreshPositionState(): Promise<PositionState | undefined> {
    if (
      Boolean(this.solautoPositionState) &&
      Number(this.solautoPositionState!.lastUpdated) >
        currentUnixSeconds() - MIN_POSITION_STATE_FRESHNESS_SECS &&
      !this.livePositionUpdates.hasUpdates()
    ) {
      return this.solautoPositionState;
    }

    return undefined;
  }
}
