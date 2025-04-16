import { PublicKey } from "@solana/web3.js";
import { Signer, TransactionBuilder, Umi } from "@metaplex-foundation/umi";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { FlProviderBase } from "./flProviderBase";
import { FlashLoanDetails, ProgramEnv } from "../../types";
import { TokenType } from "../../generated";
import { MarginfiFlProvider } from "./marginfiFlProvider";

export class FlProviderAggregator extends FlProviderBase {
  private marginfiFlProvider!: MarginfiFlProvider;

  constructor(
    umi: Umi,
    signer: Signer,
    authority: PublicKey,
    supplyMint: PublicKey,
    debtMint: PublicKey,
    programEnv?: ProgramEnv
  ) {
    super(umi, signer, authority, supplyMint, debtMint, programEnv);
    this.marginfiFlProvider = new MarginfiFlProvider(
      umi,
      signer,
      authority,
      supplyMint,
      debtMint,
      programEnv
    );
  }

  async initialize() {
    // TODO: LP
    // Once we have more than one, set the right fl provider for each liquidity source
    await this.marginfiFlProvider.initialize();
  }

  async flAccountPrereqIxs(): Promise<TransactionBuilder> {
    return await this.marginfiFlProvider.initializeIMfiAccounts();
  }

  otherSigners(): Signer[] {
    // TODO: LP
    return [...this.flSigners, ...this.marginfiFlProvider.otherSigners()];
  }

  lutAccountsToAdd(): PublicKey[] {
    return toWeb3JsPublicKey(this.signer.publicKey).equals(this.authority)
      ? [
          ...super.lutAccountsToAdd(),
          ...this.marginfiFlProvider.lutAccountsToAdd(),
        ]
      : [];
  }

  private flProvider(source: TokenType): FlProviderBase {
    // TODO: LP
    return this.marginfiFlProvider;
  }

  liquiditySource(source: TokenType): PublicKey {
    return this.flProvider(source).liquiditySource(source);
  }

  liquidityAvailable(source: TokenType): bigint {
    return this.flProvider(source).liquidityAvailable(source);
  }

  flFeeBps(source: TokenType, signerFlashLoan?: boolean): number {
    return this.flProvider(source).flFeeBps(source, signerFlashLoan);
  }

  flashBorrow(
    flashLoan: FlashLoanDetails,
    destTokenAccount: PublicKey
  ): TransactionBuilder {
    return this.flProvider(flashLoan.liquiditySource).flashBorrow(
      flashLoan,
      destTokenAccount
    );
  }

  flashRepay(flashLoan: FlashLoanDetails): TransactionBuilder {
    return this.flProvider(flashLoan.liquiditySource).flashRepay(
      flashLoan
    );
  }
}
