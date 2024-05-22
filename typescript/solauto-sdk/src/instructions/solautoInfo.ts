import { Keypair, PublicKey } from "@solana/web3.js";
import {
  LendingPlatform,
  ReferralStateAccount,
  SolautoPosition,
} from "../generated";
import {
  getReferralStateAccount,
  getSolautoPositionAccount,
  getTokenAccount,
} from "../utils/accountUtils";
import { SOLAUTO_FEES_WALLET, WSOL_MINT } from "../constants/generalAccounts";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { MarginfiTokenAccounts } from "../types";
import {
  MARGINFI_GROUP,
  findMarginfiAccountsByMint,
} from "../constants/marginfiAccounts";

interface Account<T> {
  pubkey: PublicKey;
  data: T;
}

export interface SolautoInfoArgs {
  signer: PublicKey;
  position: {
    newPositionId?: number;
    existingSolautoPosition?: Account<SolautoPosition>;
  };
  supplyLiquidityMint?: PublicKey;
  debtLiquidityMint?: PublicKey;
  referralState?: Account<ReferralStateAccount>;
  referralFeesDestMint?: PublicKey;
  referredByAuthority?: PublicKey;
}

export class SolautoInfo {
  public signer: PublicKey;
  public positionId: number;
  public solautoPosition: PublicKey;
  public solautoPositionData?: SolautoPosition;
  public lendingPlatform: LendingPlatform;

  public supplyLiquidityMint: PublicKey;
  public positionSupplyLiquidityTa: PublicKey;
  public signerSupplyLiquidityTa: PublicKey;

  public debtLiquidityMint: PublicKey;
  public positionDebtLiquidityTa: PublicKey;
  public signerDebtLiquidityTa: PublicKey;

  public signerReferralState: PublicKey;
  public signerReferralFeesDestMint: PublicKey;
  public signerReferralDestTa: PublicKey;

  public referredByState?: PublicKey;
  public referredByAuthority?: PublicKey;
  public referredBySupplyTa?: PublicKey;

  public solautoFeesWallet: PublicKey;
  public solautoFeesSupplyTa: PublicKey;

  async initialize(args: SolautoInfoArgs, lendingPlatform: LendingPlatform) {
    this.signer = args.signer;
    this.positionId =
      args.position.existingSolautoPosition?.data.positionId ??
      args.position.newPositionId;
    this.solautoPosition = await getSolautoPositionAccount(
      args.signer,
      this.positionId
    );
    this.solautoPositionData = args.position.existingSolautoPosition.data;
    this.lendingPlatform = lendingPlatform;

    this.supplyLiquidityMint =
      this.solautoPositionData.position.__option === "Some"
        ? toWeb3JsPublicKey(
            this.solautoPositionData.position.value.protocolData.supplyMint
          )
        : args.supplyLiquidityMint;
    this.positionSupplyLiquidityTa = await getTokenAccount(
      this.solautoPosition,
      this.supplyLiquidityMint
    );
    this.signerSupplyLiquidityTa = await getTokenAccount(
      this.signer,
      this.supplyLiquidityMint
    );

    this.debtLiquidityMint =
      this.solautoPositionData.position.__option === "Some"
        ? toWeb3JsPublicKey(
            this.solautoPositionData.position.value.protocolData.debtMint
          )
        : args.debtLiquidityMint;
    this.positionDebtLiquidityTa = await getTokenAccount(
      this.solautoPosition,
      this.debtLiquidityMint
    );
    this.signerDebtLiquidityTa = await getTokenAccount(
      this.signer,
      this.debtLiquidityMint
    );

    this.positionDebtLiquidityTa = this.signerReferralState =
      await getReferralStateAccount(this.signer);
    this.signerReferralFeesDestMint = args.referralState?.data?.destFeesMint
      ? toWeb3JsPublicKey(args.referralState?.data?.destFeesMint)
      : args.referralFeesDestMint ?? new PublicKey(WSOL_MINT);
    this.signerReferralDestTa = await getAssociatedTokenAddress(
      this.signerReferralDestTa,
      this.signerReferralState
    );

    this.referredByAuthority = args.referredByAuthority;
    if (this.referredByAuthority !== undefined) {
      this.referredByState = await getReferralStateAccount(
        this.referredByAuthority
      );
      this.referredBySupplyTa = await getTokenAccount(
        this.referredByState,
        this.supplyLiquidityMint
      );
    }

    this.solautoFeesWallet = new PublicKey(SOLAUTO_FEES_WALLET);
    this.solautoFeesSupplyTa = await getTokenAccount(
      this.solautoFeesWallet,
      this.supplyLiquidityMint
    );
  }
}

export interface SolautoMarginfiInfoArgs extends SolautoInfoArgs {
  marginfiAccount?: PublicKey;
  marginfiAccountKeypair?: Keypair;
  marginfiAccountSeedIdx?: bigint;

  supplyMarginfiTokenAccounts: MarginfiTokenAccounts;
  debtMarginfiTokenAccounts: MarginfiTokenAccounts;
}

export class SolautoMarginfiInfo extends SolautoInfo {
  public marginfiAccountKeypair?: Keypair;
  public marginfiAccountSeedIdx?: bigint;
  public marginfiGroup?: PublicKey;

  public supplyMarginfiTokenAccounts?: MarginfiTokenAccounts;
  public debtMarginfiTokenAccounts?: MarginfiTokenAccounts;

  async initialize(args: SolautoMarginfiInfoArgs) {
    this.marginfiAccountKeypair = args.marginfiAccountKeypair;
    this.marginfiAccountSeedIdx = args.marginfiAccountSeedIdx;
    this.marginfiGroup = new PublicKey(MARGINFI_GROUP);

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
}
