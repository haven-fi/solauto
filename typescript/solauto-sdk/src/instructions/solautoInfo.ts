import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import {
  Signer,
  TransactionBuilder,
  Umi,
  isOption,
  publicKey,
  PublicKey as UmiPublicKey
} from "@metaplex-foundation/umi";
import {
  LendingPlatform,
  ReferralState,
  SolautoPosition,
  UpdatePositionDataArgs,
  cancelDCA,
  claimReferralFees,
  closePosition,
  createSolautoProgram,
  updatePosition,
  updateReferralStates,
} from "../generated";
import {
  getReferralState,
  getSolautoPositionAccount,
  getTokenAccount,
} from "../utils/accountUtils";
import { SOLAUTO_FEES_WALLET, WSOL_MINT } from "../constants/generalAccounts";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
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

  referralState?: Account<ReferralState>;
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
  public authorityReferralStateData?: ReferralState;
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
      args.position.newPositionId!;
    this.solautoPosition = await getSolautoPositionAccount(
      toWeb3JsPublicKey(args.signer.publicKey),
      this.positionId
    );
    this.solautoPositionData = args.position.existingSolautoPosition?.data;
    this.lendingPlatform = lendingPlatform;

    this.supplyLiquidityMint =
      this.solautoPositionData?.position.__option === "Some"
        ? toWeb3JsPublicKey(
            this.solautoPositionData.position.value.protocolData.supplyMint
          )
        : args.supplyLiquidityMint!;
    this.positionSupplyLiquidityTa = getTokenAccount(
      this.solautoPosition,
      this.supplyLiquidityMint
    );
    this.signerSupplyLiquidityTa = getTokenAccount(
      toWeb3JsPublicKey(this.signer.publicKey),
      this.supplyLiquidityMint
    );

    this.debtLiquidityMint =
      this.solautoPositionData?.position.__option === "Some"
        ? toWeb3JsPublicKey(
            this.solautoPositionData.position.value.protocolData.debtMint
          )
        : args.debtLiquidityMint!;
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
        : await getReferralState(
            toWeb3JsPublicKey(this.signer.publicKey)
          );
    this.authorityReferralStateData = args.referralState?.data;
    this.authorityReferralFeesDestMint = args.referralFeesDestMint
      ? args.referralFeesDestMint
      : args.referralState?.data?.destFeesMint
      ? toWeb3JsPublicKey(args.referralState?.data?.destFeesMint)
      : WSOL_MINT;
    this.authorityReferralDestTa = getAssociatedTokenAddressSync(
      this.authorityReferralFeesDestMint,
      this.authorityReferralState,
      true
    );

    this.referredByState =
      args.referralState?.data.referredByState &&
      args.referralState?.data.referredByState.__option === "Some"
        ? toWeb3JsPublicKey(args.referralState?.data.referredByState.value)
        : args.referredByAuthority
        ? await getReferralState(args.referredByAuthority!)
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
    });
  }

  claimReferralFeesIx(): TransactionBuilder {
    const feesDestinationTa =
      this.authorityReferralFeesDestMint !== WSOL_MINT
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

  updatePositionIx(args: UpdatePositionDataArgs): TransactionBuilder {
    let debtMint: UmiPublicKey | undefined = undefined;
    let positionDebtTa: UmiPublicKey | undefined = undefined;
    let signerDebtTa: UmiPublicKey | undefined = undefined;
    if (isOption(args.activeDca) && args.activeDca.__option === "Some") {
      debtMint = publicKey(this.debtLiquidityMint);
      positionDebtTa = publicKey(this.positionDebtLiquidityTa);
      signerDebtTa = publicKey(this.signerDebtLiquidityTa);
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
      signerSupplyLiquidityTa: publicKey(this.signerSupplyLiquidityTa),
      positionSupplyLiquidityTa: publicKey(this.positionSupplyLiquidityTa),
      positionDebtLiquidityTa: publicKey(this.positionDebtLiquidityTa),
      signerDebtLiquidityTa: publicKey(this.signerDebtLiquidityTa),
    });
  }

  cancelDCAIx(): TransactionBuilder {
    let debtMint: UmiPublicKey | undefined = undefined;
    let positionDebtTa: UmiPublicKey | undefined = undefined;
    let signerDebtTa: UmiPublicKey | undefined = undefined;

    if (this.solautoPositionData?.position?.__option === "Some") {
      const positionData = this.solautoPositionData?.position?.value;
      if (
        positionData.activeDca.__option === "Some" &&
        positionData.activeDca.value.addToPos.__option === "Some"
      ) {
        debtMint = publicKey(this.debtLiquidityMint);
        positionDebtTa = publicKey(this.positionDebtLiquidityTa);
        signerDebtTa = publicKey(this.signerDebtLiquidityTa);
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
}
