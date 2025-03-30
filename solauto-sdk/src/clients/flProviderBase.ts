import { Signer, TransactionBuilder, Umi } from "@metaplex-foundation/umi";
import { PublicKey } from "@solana/web3.js";
import { fromBaseUnit, safeGetPrice, tokenInfo } from "../utils";
import { TokenType } from "../generated";
import { FlashLoanDetails } from "../types";

export abstract class FlProviderBase {
  public otherSigners: Signer[] = [];

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
    flashLoan: FlashLoanDetails,
    destinationTokenAccount: PublicKey
  ): TransactionBuilder;
  abstract flashRepay(flashLoan: FlashLoanDetails): TransactionBuilder;
}
