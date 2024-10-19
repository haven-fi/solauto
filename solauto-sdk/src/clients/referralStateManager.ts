import { PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  publicKey,
  Signer,
  signerIdentity,
  TransactionBuilder,
  Umi,
} from "@metaplex-foundation/umi";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import {
  WalletAdapter,
  walletAdapterIdentity,
} from "@metaplex-foundation/umi-signer-wallet-adapters";
import {
  claimReferralFees,
  createSolautoProgram,
  ReferralState,
  safeFetchReferralState,
  updateReferralStates,
} from "../generated";
import { getReferralState, getTokenAccount } from "../utils";
import { TxHandler } from "./txHandler";
import { SOLAUTO_LUT } from "../constants";

export interface ReferralStateManagerArgs {
  signer?: Signer;
  wallet?: WalletAdapter;
  authority?: PublicKey;
  referredByAuthority?: PublicKey;
}

export class ReferralStateManager extends TxHandler {
  public umi!: Umi;
  public signer!: Signer;

  public authority!: PublicKey;
  public referralState!: PublicKey;
  public referralStateData!: ReferralState | null;

  public referredBy?: PublicKey;
  public referredByState?: PublicKey;

  constructor(
    rpcUrl: string,
    public localTest?: boolean
  ) {
    super(rpcUrl, localTest);
    this.umi = this.umi.use({
      install(umi) {
        umi.programs.add(createSolautoProgram(), false);
      },
    });
  }

  async initialize(args: ReferralStateManagerArgs) {
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

    this.referralState = getReferralState(
      args.authority ?? toWeb3JsPublicKey(this.signer.publicKey)
    );
    this.referralStateData = await safeFetchReferralState(
      this.umi,
      publicKey(this.referralState),
      { commitment: "confirmed" }
    );

    this.setReferredBy(args.referredByAuthority);
  }

  defaultLookupTables(): string[] {
    return this.referralStateData?.lookupTable &&
      !toWeb3JsPublicKey(this.referralStateData!.lookupTable).equals(
        PublicKey.default
      )
      ? [SOLAUTO_LUT, this.referralStateData?.lookupTable.toString()]
      : [SOLAUTO_LUT];
  }

  setReferredBy(referredBy?: PublicKey) {
    const hasReferredBy =
      this.referralStateData &&
      this.referralStateData.referredByState !== publicKey(PublicKey.default);
    const finalReferredBy =
      !hasReferredBy &&
      referredBy &&
      !referredBy.equals(toWeb3JsPublicKey(this.signer.publicKey))
        ? referredBy
        : undefined;

    this.referredBy = finalReferredBy;
    this.referredByState = finalReferredBy
      ? getReferralState(finalReferredBy)
      : this.referralStateData
        ? toWeb3JsPublicKey(this.referralStateData.referredByState)
        : undefined;
  }

  updateReferralStatesIx(
    destFeesMint?: PublicKey,
    lookupTable?: PublicKey
  ): TransactionBuilder {
    return updateReferralStates(this.umi, {
      signer: this.signer,
      signerReferralState: publicKey(this.referralState),
      referralFeesDestMint: destFeesMint ? publicKey(destFeesMint) : null,
      referredByState: this.referredByState
        ? publicKey(this.referredByState)
        : undefined,
      referredByAuthority: this.referredBy
        ? publicKey(this.referredBy)
        : undefined,
      addressLookupTable: lookupTable ? publicKey(lookupTable) : null,
    });
  }

  claimReferralFeesIx(destFeesMint?: PublicKey): TransactionBuilder {
    const referralFeesDestMint =
      destFeesMint ?? toWeb3JsPublicKey(this.referralStateData!.destFeesMint);
    const referralDestTa = getTokenAccount(
      this.referralState,
      referralFeesDestMint
    );
    const feesDestinationTa =
      referralFeesDestMint !== NATIVE_MINT
        ? publicKey(
            getTokenAccount(
              toWeb3JsPublicKey(this.signer.publicKey),
              referralFeesDestMint
            )
          )
        : undefined;

    return claimReferralFees(this.umi, {
      signer: this.signer,
      signerWsolTa: publicKey(
        getTokenAccount(toWeb3JsPublicKey(this.signer.publicKey), NATIVE_MINT)
      ),
      referralAuthority: publicKey(this.authority),
      referralState: publicKey(this.referralState),
      referralFeesDestTa: publicKey(referralDestTa),
      referralFeesDestMint: publicKey(referralFeesDestMint),
      feesDestinationTa,
    });
  }

  async resetLiveTxUpdates(success?: boolean): Promise<void> {}
}
