import { PublicKey } from "@solana/web3.js";
import {
  Signer,
  transactionBuilder,
  TransactionBuilder,
  Umi,
} from "@metaplex-foundation/umi";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import {
  fromBaseUnit,
  getTokenAccount,
  safeGetPrice,
  splTokenTransferUmiIx,
  tokenInfo,
} from "../../utils";
import { TokenType } from "../../generated";
import { FlashLoanDetails, ProgramEnv } from "../../types";

export abstract class FlProviderBase {
  protected flSigners: Signer[] = [];

  constructor(
    protected umi: Umi,
    protected signer: Signer,
    protected authority: PublicKey,
    protected supplyMint: PublicKey,
    protected debtMint: PublicKey,
    protected programEnv: ProgramEnv = "Prod"
  ) {}

  abstract initialize(): Promise<void>;

  lutAccountsToAdd(): PublicKey[] {
    return [];
  }

  otherSigners(): Signer[] {
    return this.flSigners;
  }

  mint(source: TokenType) {
    return source === TokenType.Supply ? this.supplyMint : this.debtMint;
  }

  abstract liquidityAvailable(source: TokenType): bigint;
  liquidityAvailableUsd(source: TokenType): number {
    return (
      fromBaseUnit(
        this.liquidityAvailable(source),
        tokenInfo(this.mint(source)).decimals
      ) * (safeGetPrice(this.mint(source)) ?? 0)
    );
  }

  abstract flFeeBps(source: TokenType, signerFlashLoan?: boolean): number;
  abstract flashBorrow(
    flashLoan: FlashLoanDetails,
    destTokenAccount: PublicKey
  ): TransactionBuilder;
  abstract flashRepay(flashLoan: FlashLoanDetails): TransactionBuilder;

  protected signerFlashBorrow(
    flashLoan: FlashLoanDetails,
    destTokenAccount: PublicKey
  ): TransactionBuilder {
    if (
      !destTokenAccount.equals(
        getTokenAccount(
          toWeb3JsPublicKey(this.signer.publicKey),
          flashLoan.mint
        )
      )
    ) {
      return transactionBuilder().add(
        splTokenTransferUmiIx(
          this.signer,
          getTokenAccount(
            toWeb3JsPublicKey(this.signer.publicKey),
            flashLoan.mint
          ),
          destTokenAccount,
          toWeb3JsPublicKey(this.signer.publicKey),
          flashLoan.baseUnitAmount
        )
      );
    } else {
      return transactionBuilder();
    }
  }
}
