import "rpc-websockets/dist/lib/client";
import { AddressLookupTableProgram, PublicKey } from "@solana/web3.js";
import {
  TransactionBuilder,
  isOption,
  publicKey,
  PublicKey as UmiPublicKey,
  isSome,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import {
  DCASettingsInpArgs,
  LendingPlatform,
  SolautoActionArgs,
  SolautoRebalanceType,
  SolautoRebalanceTypeArgs,
  SolautoSettingsParametersInpArgs,
  TokenType,
  UpdatePositionDataArgs,
  cancelDCA,
  closePosition,
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
import { SOLAUTO_LUT } from "../constants/solautoConstants";
import { ContextUpdates } from "../utils/solauto/generalUtils";
import {
  ReferralStateManager,
  ReferralStateManagerArgs,
} from "./referralStateManager";
import { QuoteResponse } from "@jup-ag/api";
import { getOrCreatePositionEx, SolautoPositionEx } from "../solautoPosition";

export interface SolautoClientArgs extends ReferralStateManagerArgs {
  new?: boolean;
  positionId?: number;
  supplyMint?: PublicKey;
  debtMint?: PublicKey;
  lendingPool?: PublicKey;
  lpUserAccount?: PublicKey;
}

export abstract class SolautoClient extends ReferralStateManager {
  public lendingPlatform?: LendingPlatform;

  public authority!: PublicKey;

  public positionId!: number;
  public selfManaged!: boolean;
  public solautoPosition!: SolautoPositionEx;

  public supplyMint!: PublicKey;
  public positionSupplyTa!: PublicKey;
  public signerSupplyTa!: PublicKey;

  public debtMint!: PublicKey;
  public positionDebtTa!: PublicKey;
  public signerDebtTa!: PublicKey;

  public solautoFeesSupplyTa!: PublicKey;
  public solautoFeesDebtTa!: PublicKey;

  public authorityLutAddress?: PublicKey;

  public contextUpdates: ContextUpdates = new ContextUpdates();

  private signerSupplyBalance: bigint | undefined;
  private signerDebtBalance: bigint | undefined;

  async initialize(args: SolautoClientArgs) {
    await super.initialize(args);

    this.positionId = args.positionId ?? 0;
    this.selfManaged = this.positionId === 0;
    const positionPk = getSolautoPositionAccount(
      this.authority,
      this.positionId,
      this.programId
    );
    this.solautoPosition = await getOrCreatePositionEx(
      this.umi,
      positionPk,
      this.contextUpdates,
      {
        supplyMint: args.supplyMint ?? PublicKey.default,
        debtMint: args.debtMint ?? PublicKey.default,
        lendingPool: args.lendingPool ?? PublicKey.default,
        lpUserAccount: args.lpUserAccount,
        lendingPlatform: this.lendingPlatform!,
      }
    );

    this.positionSupplyTa = getTokenAccount(
      this.solautoPosition.publicKey,
      this.supplyMint
    );
    this.signerSupplyTa = getTokenAccount(
      toWeb3JsPublicKey(this.signer.publicKey),
      this.supplyMint
    );

    this.positionDebtTa = getTokenAccount(
      this.solautoPosition.publicKey,
      this.debtMint
    );
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

    this.log("Position state: ", this.solautoPosition.state());
    this.log("Position settings: ", this.solautoPosition.settings());
    this.log("Position DCA: ", this.solautoPosition.dca());
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
    this.log("Resetting context updates...");
    if (success) {
      if (!this.solautoPosition.exists()) {
        await this.solautoPosition.refetchPositionData();
      } else {
        if (this.contextUpdates.settings) {
          this.solautoPosition.data.position!.settings =
            this.contextUpdates.settings;
        }
        if (this.contextUpdates.dca) {
          this.solautoPosition.data.position!.dca = this.contextUpdates.dca;
        }
        // All other live position updates can be derived by getting a fresh position state, so we don't need to do anything else form contextUpdates
      }
    }
    this.contextUpdates.reset();
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
      this.solautoPosition.publicKey,
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

  async signerBalances(): Promise<{
    supplyBalance: bigint;
    debtBalance: bigint;
  }> {
    if (
      this.signerSupplyBalance !== undefined &&
      this.signerDebtBalance !== undefined
    ) {
      return {
        supplyBalance: this.signerSupplyBalance,
        debtBalance: this.signerDebtBalance,
      };
    }

    [this.signerSupplyBalance, this.signerDebtBalance] = await Promise.all([
      (async () => {
        const data = await this.connection.getTokenAccountBalance(
          getTokenAccount(
            toWeb3JsPublicKey(this.signer.publicKey),
            this.supplyMint
          ),
          "confirmed"
        );
        return BigInt(parseInt(data?.value.amount ?? "0"));
      })(),
      (async () => {
        const data = await this.connection.getTokenAccountBalance(
          getTokenAccount(
            toWeb3JsPublicKey(this.signer.publicKey),
            this.debtMint
          ),
          "confirmed"
        );
        return BigInt(parseInt(data?.value.amount ?? "0"));
      })(),
    ]);

    return {
      supplyBalance: this.signerSupplyBalance,
      debtBalance: this.signerDebtBalance,
    };
  }

  openPosition(
    settings?: SolautoSettingsParametersInpArgs,
    dca?: DCASettingsInpArgs
  ): TransactionBuilder {
    if (dca && dca.dcaInBaseUnit > 0) {
      this.contextUpdates.new({
        type: "dcaInBalance",
        value: {
          amount: BigInt(dca.dcaInBaseUnit),
          tokenType: dca.tokenType,
        },
      });
    }
    if (settings) {
      this.contextUpdates.new({
        type: "settings",
        value: settings,
      });
    }
    if (dca) {
      this.contextUpdates.new({
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

      if (
        isOption(args.dca) &&
        isSome(args.dca) &&
        args.dca.value.dcaInBaseUnit > 0
      ) {
        this.contextUpdates.new({
          type: "dcaInBalance",
          value: {
            amount: BigInt(args.dca.value.dcaInBaseUnit),
            tokenType: args.dca.value.tokenType,
          },
        });
      }
    }

    if (isOption(args.settings) && isSome(args.settings)) {
      this.contextUpdates.new({
        type: "settings",
        value: args.settings.value,
      });
    }

    if (isOption(args.dca) && isSome(args.dca)) {
      this.contextUpdates.new({
        type: "dca",
        value: args.dca.value,
      });
    }

    return updatePosition(this.umi, {
      signer: this.signer,
      solautoPosition: publicKey(this.solautoPosition.publicKey),
      dcaMint,
      positionDcaTa,
      signerDcaTa,
      updatePositionData: args,
    });
  }

  closePositionIx(): TransactionBuilder {
    return closePosition(this.umi, {
      signer: this.signer,
      solautoPosition: publicKey(this.solautoPosition.publicKey),
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

    const currDca = this.solautoPosition.dca()!;
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

      this.contextUpdates.new({
        type: "cancellingDca",
        value: this.solautoPosition.dca()!.tokenType,
      });
    }

    return cancelDCA(this.umi, {
      signer: this.signer,
      solautoPosition: publicKey(this.solautoPosition.publicKey),
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
                  Number(
                    this.solautoPosition.state().debt.amountUsed.baseUnit
                  ) * 1.01
                )
              )
            )
          );
        }
      }
    }

    if (args.__kind === "Deposit") {
      this.contextUpdates.new({
        type: "supply",
        value: BigInt(args.fields[0]),
      });
    } else if (args.__kind === "Withdraw") {
      if (args.fields[0].__kind === "Some") {
        this.contextUpdates.new({
          type: "supply",
          value: BigInt(args.fields[0].fields[0]) * BigInt(-1),
        });
      } else {
        this.contextUpdates.new({
          type: "supply",
          value:
            (this.solautoPosition.state().supply.amountUsed.baseUnit ??
              BigInt(0)) * BigInt(-1),
        });
      }
    } else if (args.__kind === "Borrow") {
      this.contextUpdates.new({
        type: "debt",
        value: BigInt(args.fields[0]),
      });
    } else {
      if (args.fields[0].__kind === "Some") {
        this.contextUpdates.new({
          type: "debt",
          value: BigInt(args.fields[0].fields[0]) * BigInt(-1),
        });
      } else {
        this.contextUpdates.new({
          type: "debt",
          value:
            (this.solautoPosition.state().debt.amountUsed.baseUnit ??
              BigInt(0)) * BigInt(-1),
        });
      }
    }

    return tx;
  }

  abstract flashBorrow(
    rebalanceType: SolautoRebalanceType,
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
}
