import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import {
  Signer,
  TransactionBuilder,
  Umi,
  publicKey,
} from "@metaplex-foundation/umi";
import {
  LendingPlatform,
  ReferralStateAccount,
  SolautoPosition,
  claimReferralFees,
  createSolautoProgram,
  updateReferralStates,
} from "../generated";
import {
  getReferralStateAccount,
  getSolautoPositionAccount,
  getTokenAccount,
} from "../utils/accountUtils";
import { SOLAUTO_FEES_WALLET, WSOL_MINT } from "../constants/generalAccounts";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";

interface Account<T> {
  pubkey: PublicKey;
  data: T;
}

export interface SolautoInfoArgs {
  signer: Signer;
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
  public umi: Umi;

  public signer: Signer;
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

  public authorityReferralState: PublicKey;
  public authorityReferralFeesDestMint: PublicKey;
  public authorityReferralDestTa: PublicKey;

  public referredByState?: PublicKey;
  public referredByAuthority?: PublicKey;
  public referredBySupplyTa?: PublicKey;

  public solautoFeesWallet: PublicKey;
  public solautoFeesSupplyTa: PublicKey;

  async initialize(args: SolautoInfoArgs, lendingPlatform: LendingPlatform) {
    this.umi = createUmi(
      // TODO change url to use helius rpc
      new Connection(clusterApiUrl("mainnet-beta"), "confirmed")
    );
    this.umi = this.umi.use({
      install(umi) {
        umi.programs.add(createSolautoProgram(), false);
      },
    });

    this.signer = args.signer;
    this.positionId =
      args.position.existingSolautoPosition?.data.positionId ??
      args.position.newPositionId;
    this.solautoPosition = await getSolautoPositionAccount(
      toWeb3JsPublicKey(args.signer.publicKey),
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
    this.positionSupplyLiquidityTa = getTokenAccount(
      this.solautoPosition,
      this.supplyLiquidityMint
    );
    this.signerSupplyLiquidityTa = getTokenAccount(
      toWeb3JsPublicKey(this.signer.publicKey),
      this.supplyLiquidityMint
    );

    this.debtLiquidityMint =
      this.solautoPositionData.position.__option === "Some"
        ? toWeb3JsPublicKey(
            this.solautoPositionData.position.value.protocolData.debtMint
          )
        : args.debtLiquidityMint;
    this.positionDebtLiquidityTa = getTokenAccount(
      this.solautoPosition,
      this.debtLiquidityMint
    );
    this.signerDebtLiquidityTa = getTokenAccount(
      toWeb3JsPublicKey(this.signer.publicKey),
      this.debtLiquidityMint
    );

    this.authorityReferralState =
      args.referralState !== undefined
        ? args.referralState.pubkey
        : await getReferralStateAccount(
            toWeb3JsPublicKey(this.signer.publicKey)
          );
    this.authorityReferralFeesDestMint = args.referralFeesDestMint
      ? args.referralFeesDestMint
      : args.referralState?.data?.destFeesMint
      ? toWeb3JsPublicKey(args.referralState?.data?.destFeesMint)
      : new PublicKey(WSOL_MINT);
    this.authorityReferralDestTa = await getAssociatedTokenAddress(
      this.authorityReferralFeesDestMint,
      this.authorityReferralState
    );

    this.referredByState =
      args.referralState?.data.referredByState &&
      args.referralState?.data.referredByState.__option === "Some"
        ? toWeb3JsPublicKey(args.referralState?.data.referredByState.value)
        : args.referredByAuthority
        ? await getReferralStateAccount(this.referredByAuthority)
        : undefined;
    this.referredByAuthority = args.referredByAuthority;
    if (this.referredByState !== undefined) {
      this.referredBySupplyTa = getTokenAccount(
        this.referredByState,
        this.supplyLiquidityMint
      );
    }

    this.solautoFeesWallet = new PublicKey(SOLAUTO_FEES_WALLET);
    this.solautoFeesSupplyTa = getTokenAccount(
      this.solautoFeesWallet,
      this.supplyLiquidityMint
    );
  }

  updateReferralStates(): TransactionBuilder {
    return updateReferralStates(this.umi, {
      signer: this.signer,
      signerReferralState: publicKey(this.authorityReferralState),
      referralFeesDestMint: publicKey(this.authorityReferralFeesDestMint),
      referredByState: publicKey(this.referredByState),
      referredByAuthority: publicKey(this.referredByAuthority),
    });
  }

  claimReferralFees(): TransactionBuilder {
    const destinationTa =
      this.authorityReferralFeesDestMint !== new PublicKey(WSOL_MINT)
        ? getTokenAccount(
            toWeb3JsPublicKey(this.signer.publicKey),
            this.authorityReferralFeesDestMint
          )
        : undefined;
    return claimReferralFees(this.umi, {
      signer: this.signer,
      referralState: publicKey(this.authorityReferralState),
      referralFeesDestTa: publicKey(this.authorityReferralDestTa),
      referralFeesDestMint: publicKey(this.authorityReferralFeesDestMint),
      feesDestinationTa: publicKey(destinationTa),
    });
  }
}
