// import { publicKey } from "@metaplex-foundation/umi";
import { PublicKey } from "@solana/web3.js";
import {
  LendingPlatform,
  ReferralStateAccount,
  SOLAUTO_PROGRAM_ID,
  SolautoPosition,
} from "../generated";
import { getSolautoPositionAccount } from "../utils/accountUtils";
import { SOLAUTO_FEES_WALLET } from "../constants/generalAccounts";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";

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
  supplyMint?: PublicKey;
  debtMint?: PublicKey;
  referralState?: Account<ReferralStateAccount>;
  referralFeesDestMint?: PublicKey;
  referredByAuthority?: PublicKey;
}

export class SolautoInfo {
  public positionId: number;
  public solautoPosition: PublicKey;
  public solautoPositionData?: SolautoPosition;
  public lendingPlatform: LendingPlatform;

  public supplyMint: PublicKey;

  public solautoFeesWallet: PublicKey;
  public solautoFeesSupplyTa: PublicKey;

  async initialize(args: SolautoInfoArgs, lendingPlatform: LendingPlatform) {
    this.positionId = args.position.newPositionId;
    this.supplyMint = args.supplyMint;

    if (args.position.existingSolautoPosition !== undefined) {
      this.solautoPosition = args.position.existingSolautoPosition.pubkey;
      this.solautoPositionData = args.position.existingSolautoPosition.data;
      this.positionId = this.solautoPositionData.positionId;

      if (this.solautoPositionData.position.__option === "Some") {
        this.supplyMint = toWeb3JsPublicKey(
          this.solautoPositionData.position.value.protocolData.supplyMint
        );
      }
    } else {
      this.solautoPosition = await getSolautoPositionAccount(
        args.signer,
        args.position.newPositionId
      );
    }

    this.lendingPlatform = lendingPlatform;
    this.solautoFeesWallet = new PublicKey(SOLAUTO_FEES_WALLET);
    this.solautoFeesSupplyTa = await getAssociatedTokenAddress(
      this.supplyMint,
      this.solautoFeesWallet,
      true,
      toWeb3JsPublicKey(SOLAUTO_PROGRAM_ID)
    );
  }
}
