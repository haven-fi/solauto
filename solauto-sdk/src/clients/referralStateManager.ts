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

interface ReferralStateManagerArgs {
  signer?: Signer;
  wallet?: WalletAdapter;
  referralAuthority?: PublicKey;
  referredByAuthority?: PublicKey;
}

export class ReferralStateManager extends TxHandler {
  public umi!: Umi;
  public signer!: Signer;

  public referralAuthority!: PublicKey;
  public referralState!: PublicKey;
  public referralStateData!: ReferralState | null;

  public referredByState?: PublicKey;

  constructor(
    heliusApiUrl: string,
    public localTest?: boolean
  ) {
    super(heliusApiUrl, localTest);
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
    this.referralState = getReferralState(
      args.referralAuthority ?? toWeb3JsPublicKey(this.signer.publicKey)
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
      ? [this.referralStateData?.lookupTable.toString()]
      : [];
  }

  public setReferredBy(referredBy?: PublicKey) {
    const authorityReferralStateData = this.referralStateData;
    const hasReferredBy =
      authorityReferralStateData &&
      authorityReferralStateData.referredByState !==
        publicKey(PublicKey.default);
    const referredByAuthority =
      !hasReferredBy &&
      referredBy &&
      !referredBy.equals(toWeb3JsPublicKey(this.signer.publicKey))
        ? referredBy
        : undefined;
    this.referredByState = hasReferredBy
      ? toWeb3JsPublicKey(authorityReferralStateData!.referredByState)
      : referredByAuthority
        ? getReferralState(referredByAuthority!)
        : undefined;
    this.referredBy = referredByAuthority;
  }

  updateReferralStatesIx(
    destFeesMint?: PublicKey,
    referredBy?: PublicKey,
    lookupTable?: PublicKey
  ): TransactionBuilder {
    return updateReferralStates(this.umi, {
      signer: this.signer,
      signerReferralState: publicKey(this.referralState),
      referralFeesDestMint: destFeesMint ? publicKey(destFeesMint) : null,
      referredByState: referredBy
        ? publicKey(getReferralState(referredBy))
        : this.referredByState
          ? publicKey(this.referredByState)
          : undefined,
      referredByAuthority: referredBy ? publicKey(referredBy) : undefined,
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
      referralAuthority: publicKey(this.referralAuthority),
      referralState: publicKey(this.referralState),
      referralFeesDestTa: publicKey(referralDestTa),
      referralFeesDestMint: publicKey(referralFeesDestMint),
      feesDestinationTa,
    });
  }

  async resetLiveTxUpdates(success?: boolean): Promise<void> {}
}
