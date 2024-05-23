import { Keypair, PublicKey } from "@solana/web3.js";
import { SolautoInfo, SolautoInfoArgs } from "./solautoInfo";
import { MarginfiTokenAccounts } from "../types";
import {
  MARGINFI_GROUP,
  findMarginfiAccountsByMint,
} from "../constants/marginfiAccounts";
import { LendingPlatform } from "../generated";
import {
  getMarginfiAccountPDA,
  getSolautoPositionAccount,
} from "../utils/accountUtils";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";

export interface SolautoMarginfiInfoArgs extends SolautoInfoArgs {
  marginfiAccount?: PublicKey;
  marginfiAccountKeypair?: Keypair;
  marginfiAccountSeedIdx?: bigint;

  supplyMarginfiTokenAccounts: MarginfiTokenAccounts;
  debtMarginfiTokenAccounts: MarginfiTokenAccounts;
}

export class SolautoMarginfiInfo extends SolautoInfo {
  public marginfiAccount?: PublicKey;
  public marginfiAccountKeypair?: Keypair;
  public marginfiAccountSeedIdx?: bigint;
  public marginfiGroup?: PublicKey;

  public supplyMarginfiTokenAccounts?: MarginfiTokenAccounts;
  public debtMarginfiTokenAccounts?: MarginfiTokenAccounts;

  async initialize(args: SolautoMarginfiInfoArgs) {
    this.marginfiAccountKeypair = args.marginfiAccountKeypair;
    this.marginfiAccountSeedIdx = args.marginfiAccountSeedIdx;
    this.marginfiGroup = new PublicKey(MARGINFI_GROUP);

    const solautoPosition =
      args.position.existingSolautoPosition?.pubkey ??
      (await getSolautoPositionAccount(
        toWeb3JsPublicKey(args.signer.publicKey),
        args.position.newPositionId
      ));
    this.marginfiAccount =
      this.marginfiAccountKeypair !== undefined
        ? this.marginfiAccountKeypair.publicKey
        : await getMarginfiAccountPDA(
            solautoPosition,
            this.marginfiAccountSeedIdx
          );

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
