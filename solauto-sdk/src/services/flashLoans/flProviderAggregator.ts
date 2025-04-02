import { FlProviderBase } from "./flProviderBase";
import { PublicKey } from "@solana/web3.js";
import { FlashLoanDetails, FlashLoanRequirements } from "../../types";
import { Signer, TransactionBuilder, Umi } from "@metaplex-foundation/umi";
import { TokenType } from "../../generated";
import { MarginfiFlProvider } from "./marginfiFlProvider";

export class FlProviderAggregator extends FlProviderBase {
  private marginfiFlProvider!: MarginfiFlProvider;

  constructor(
    umi: Umi,
    signer: Signer,
    supplyMint: PublicKey,
    debtMint: PublicKey
  ) {
    super(umi, signer, supplyMint, debtMint);
    this.marginfiFlProvider = new MarginfiFlProvider(
      umi,
      signer,
      supplyMint,
      debtMint
    );
  }

  async initialize() {
    // TODO: PF
    // Once we have more than one, set the right fl provider for each liquidity source
    await this.marginfiFlProvider.initialize();
  }

  async flAccountPrereqIxs(): Promise<TransactionBuilder> {
    return await this.marginfiFlProvider.initializeIMfiAccounts();
  }

  otherSigners(): Signer[] {
    // TODO: PF
    return [...this.flSigners, ...this.marginfiFlProvider.otherSigners()];
  }

  lutAccountsToAdd(): PublicKey[] {
    return [
      ...super.lutAccountsToAdd(),
      ...this.marginfiFlProvider.lutAccountsToAdd(),
    ];
  }

  private flProvider(source: TokenType): FlProviderBase {
    // TODO: PF
    return this.marginfiFlProvider;
  }

  liquidityAvailable(source: TokenType): bigint {
    return this.flProvider(source).liquidityAvailable(source);
  }

  flFeeBps(source: TokenType, signerFlashLoan?: boolean): number {
    return this.flProvider(source).flFeeBps(source);
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
    return this.flProvider(flashLoan.liquiditySource).flashRepay(flashLoan);
  }
}
