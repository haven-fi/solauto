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
  PriceType,
  RebalanceStep,
  SolautoActionArgs,
  SolautoSettingsParametersInpArgs,
  TokenType,
  UpdatePositionDataArgs,
  cancelDCA,
  updatePosition,
} from "../../generated";
import {
  getSolautoPositionAccount,
  getTokenAccount,
  getWalletSplBalances,
  getWrappedInstruction,
  splTokenTransferUmiIx,
  ContextUpdates,
} from "../../utils";
import { SOLAUTO_FEES_WALLET, SOLAUTO_LUT } from "../../constants";
import { ProgramEnv, RebalanceDetails } from "../../types";
import {
  ReferralStateManager,
  ReferralStateManagerArgs,
} from "./referralStateManager";
import {
  getOrCreatePositionEx,
  SolautoPositionEx,
} from "../../solautoPosition";
import { FlProviderAggregator } from "../flashLoans";

export interface SolautoClientArgs extends ReferralStateManagerArgs {
  positionId?: number;
  supplyMint?: PublicKey;
  debtMint?: PublicKey;
  lendingPool?: PublicKey;
  lpUserAccount?: PublicKey;
}

export abstract class SolautoClient extends ReferralStateManager {
  public lendingPlatform!: LendingPlatform;
  public lpEnv!: ProgramEnv;

  public authority!: PublicKey;

  public positionId!: number;
  public selfManaged!: boolean;
  public pos!: SolautoPositionEx;

  public positionSupplyTa!: PublicKey;
  public signerSupplyTa!: PublicKey;

  public positionDebtTa!: PublicKey;
  public signerDebtTa!: PublicKey;

  public solautoFeesSupplyTa!: PublicKey;
  public solautoFeesDebtTa!: PublicKey;

  public authorityLutAddress?: PublicKey;

  public flProvider!: FlProviderAggregator;
  public contextUpdates: ContextUpdates = new ContextUpdates();

  private signerSupplyBalance: bigint | undefined;
  private signerDebtBalance: bigint | undefined;

  async initialize(args: SolautoClientArgs) {
    await super.initialize(args);

    this.positionId = args.positionId ?? 0;
    this.selfManaged = this.positionId === 0;
    if (
      this.selfManaged &&
      (!args.supplyMint || !args.debtMint || !args.lpUserAccount)
    ) {
      throw new Error("Self managed position is missing arguments");
    }

    const positionPk = getSolautoPositionAccount(
      this.authority,
      this.positionId,
      this.programId
    );
    this.pos = await getOrCreatePositionEx(
      this.umi,
      positionPk,
      {
        supplyMint: args.supplyMint,
        debtMint: args.debtMint,
        lendingPool: args.lendingPool,
        lpUserAccount: args.lpUserAccount,
        lendingPlatform: this.lendingPlatform,
        lpEnv: this.lpEnv,
      },
      this.contextUpdates
    );
    if (this.pos.selfManaged && (!args.supplyMint || !args.debtMint)) {
      await this.pos.refreshPositionState();
    }

    this.positionSupplyTa = getTokenAccount(
      this.pos.publicKey,
      this.pos.supplyMint
    );
    this.signerSupplyTa = getTokenAccount(
      toWeb3JsPublicKey(this.signer.publicKey),
      this.pos.supplyMint
    );

    this.positionDebtTa = getTokenAccount(
      this.pos.publicKey,
      this.pos.debtMint
    );
    this.signerDebtTa = getTokenAccount(
      toWeb3JsPublicKey(this.signer.publicKey),
      this.pos.debtMint
    );

    this.solautoFeesSupplyTa = getTokenAccount(
      SOLAUTO_FEES_WALLET,
      this.pos.supplyMint
    );
    this.solautoFeesDebtTa = getTokenAccount(
      SOLAUTO_FEES_WALLET,
      this.pos.debtMint
    );

    this.authorityLutAddress =
      this.referralStateData?.lookupTable &&
      !toWeb3JsPublicKey(this.referralStateData.lookupTable).equals(
        PublicKey.default
      )
        ? toWeb3JsPublicKey(this.referralStateData.lookupTable)
        : undefined;

    this.flProvider = new FlProviderAggregator(
      this.umi,
      this.signer,
      this.authority,
      this.pos.supplyMint,
      this.pos.debtMint,
      this.lpEnv
    );
    await this.flProvider.initialize();
    this.otherSigners.push(...this.flProvider.otherSigners());

    this.log("Position state: ", this.pos.state);
    this.log("Position settings: ", this.pos.settings);
    this.log("Position DCA: ", this.pos.dca);
    this.log("Supply mint:", this.pos.supplyMint.toString());
    this.log("Debt mint:", this.pos.debtMint.toString());
  }

  referredBySupplyTa(): PublicKey | undefined {
    if (this.referredByState !== undefined) {
      return getTokenAccount(this.referredByState, this.pos.supplyMint);
    }
    return undefined;
  }

  referredByDebtTa(): PublicKey | undefined {
    if (this.referredByState !== undefined) {
      return getTokenAccount(this.referredByState, this.pos.debtMint);
    }
    return undefined;
  }

  async resetLiveTxUpdates(success?: boolean) {
    this.log("Resetting context updates...");
    if (success) {
      if (!this.pos.exists) {
        await this.pos.refetchPositionData();
      } else {
        if (this.contextUpdates.settings) {
          this.pos.updateSettings(this.contextUpdates.settings);
        }
        if (this.contextUpdates.dca) {
          this.pos.updateDca(this.contextUpdates.dca);
        }
        // All other live position updates can be derived by getting a fresh position state, so we don't need to do anything else form contextUpdates
      }
    }
    this.contextUpdates.reset();
  }

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
      ...(this.authorityLutAddress ? [this.authorityLutAddress] : []),
      this.signerSupplyTa,
      this.signerDebtTa,
      this.pos.publicKey,
      this.positionSupplyTa,
      this.positionDebtTa,
      this.referralState,
      ...(this.referredBySupplyTa() ? [this.referredBySupplyTa()!] : []),
      ...(this.referredByDebtTa() ? [this.referredByDebtTa()!] : []),
      ...this.flProvider.lutAccountsToAdd(),
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
    if (!toWeb3JsPublicKey(this.signer.publicKey).equals(this.authority)) {
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
      tx = tx
        .add(getWrappedInstruction(this.signer, createLookupTableInst))
        .add(this.updateReferralStatesIx(undefined, this.authorityLutAddress));
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

    tx = tx
      .add(
        getWrappedInstruction(
          this.signer,
          AddressLookupTableProgram.extendLookupTable({
            payer: toWeb3JsPublicKey(this.signer.publicKey),
            authority: this.authority,
            lookupTable: this.authorityLutAddress,
            addresses: accountsToAdd,
          })
        )
      )
      .add(await this.flProvider.flAccountPrereqIxs());

    this.log("Requires authority LUT update...");
    this.log("Addresses to add:", accountsToAdd.join(", "));
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
    if (!this.signerSupplyBalance || !this.signerDebtBalance) {
      [this.signerSupplyBalance, this.signerDebtBalance] =
        await getWalletSplBalances(
          this.connection,
          toWeb3JsPublicKey(this.signer.publicKey),
          [this.pos.supplyMint, this.pos.debtMint]
        );
    }

    return {
      supplyBalance: this.signerSupplyBalance,
      debtBalance: this.signerDebtBalance,
    };
  }

  openPositionIx(
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
        dcaMint = publicKey(this.pos.supplyMint);
        positionDcaTa = publicKey(this.positionSupplyTa);
        signerDcaTa = publicKey(this.signerSupplyTa);
      } else {
        dcaMint = publicKey(this.pos.debtMint);
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
      solautoPosition: publicKey(this.pos.publicKey),
      dcaMint,
      positionDcaTa,
      signerDcaTa,
      updatePositionData: args,
    });
  }

  abstract closePositionIx(): TransactionBuilder;

  cancelDCAIx(): TransactionBuilder {
    let dcaMint: UmiPublicKey | undefined = undefined;
    let positionDcaTa: UmiPublicKey | undefined = undefined;
    let signerDcaTa: UmiPublicKey | undefined = undefined;

    const currDca = this.pos.dca!;
    if (currDca.dcaInBaseUnit > 0) {
      if (currDca.tokenType === TokenType.Supply) {
        dcaMint = publicKey(this.pos.supplyMint);
        positionDcaTa = publicKey(this.positionSupplyTa);
        signerDcaTa = publicKey(this.signerSupplyTa);
      } else {
        dcaMint = publicKey(this.pos.debtMint);
        positionDcaTa = publicKey(this.positionDebtTa);
        signerDcaTa = publicKey(this.signerDebtTa);
      }

      this.contextUpdates.new({
        type: "cancellingDca",
        value: this.pos.dca!.tokenType,
      });
    }

    return cancelDCA(this.umi, {
      signer: this.signer,
      solautoPosition: publicKey(this.pos.publicKey),
      dcaMint,
      positionDcaTa,
      signerDcaTa,
    });
  }

  abstract refreshIx(priceType: PriceType): TransactionBuilder;

  protocolInteractionIx(args: SolautoActionArgs): TransactionBuilder {
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
                  Number(this.pos.state.debt.amountUsed.baseUnit) * 1.01
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
            (this.pos.state.supply.amountUsed.baseUnit ?? BigInt(0)) *
            BigInt(-1),
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
            (this.pos.state.debt.amountUsed.baseUnit ?? BigInt(0)) * BigInt(-1),
        });
      }
    }

    return tx;
  }

  abstract rebalanceIx(
    rebalanceStep: RebalanceStep,
    data: RebalanceDetails
  ): TransactionBuilder;
}
