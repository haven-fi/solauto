import { Signer, TransactionBuilder, Umi } from "@metaplex-foundation/umi";
import { PublicKey } from "@solana/web3.js";
import {
  FlashLoanDetails,
  fromBaseUnit,
  safeGetPrice,
  tokenInfo,
} from "../utils";
import { TokenType } from "../generated";

export abstract class FlProviderBase {
  public otherSigners = [];

  constructor(
    protected umi: Umi,
    protected signer: Signer,
    protected supplyMint: PublicKey,
    protected debtMint: PublicKey
  ) {}

  async initialize() {}

  lutAccountsToAdd() {
    return [];
  }

  public mint(source: TokenType) {
    return source === TokenType.Supply ? this.supplyMint : this.debtMint;
  }

  abstract liquidityAvailable(source: TokenType): bigint;
  public liquidityAvailableUsd(source: TokenType): number {
    return (
      fromBaseUnit(
        this.liquidityAvailable(source),
        tokenInfo(this.mint(source)).decimals
      ) * (safeGetPrice(this.mint(source)) ?? 0)
    );
  }

  abstract flFeeBps(source: TokenType): number;
  abstract flashBorrow(
    flashLoanDetails: FlashLoanDetails,
    destinationTokenAccount: PublicKey
  ): TransactionBuilder;
  abstract flashRepay(flashLoanDetails: FlashLoanDetails): TransactionBuilder;
}
