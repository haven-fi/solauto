import {
  Signer,
  TransactionBuilder,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import {
  createJupiterApiClient,
  QuoteResponse,
  SwapInstructionsResponse,
} from "@jup-ag/api";
import { getWrappedInstruction } from "../../utils/solanaUtils";
import { fromBps, toBps } from "../../utils/numberUtils";
import { getTokenAccount } from "../../utils/accountUtils";
import { PublicKey } from "@solana/web3.js";
import {
  consoleLog,
  jupIxToSolanaIx,
  retryWithExponentialBackoff,
} from "../../utils";
import { TransactionItemInputs } from "../../types";

export interface SwapInput {
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: bigint;
  exactIn?: boolean;
  exactOut?: boolean;
}

export interface SwapArgs extends SwapInput {
  destinationWallet: PublicKey;
  slippageIncFactor?: number;
  wrapAndUnwrapSol?: boolean;
}

export interface JupSwapTransactionData {
  setupInstructions: TransactionBuilder;
  swapIx: TransactionBuilder;
  cleanupIx: TransactionBuilder;
  lookupTableAddresses: string[];
}

export class JupSwapManager {
  jupApi = createJupiterApiClient();

  public jupQuote: QuoteResponse | undefined = undefined;

  constructor(private signer: Signer) {}

  public async getQuote(data: SwapArgs): Promise<QuoteResponse> {
    return await retryWithExponentialBackoff(
      async (attemptNum: number) =>
        await this.jupApi.quoteGet({
          amount: Number(data.amount),
          inputMint: data.inputMint.toString(),
          outputMint: data.outputMint.toString(),
          swapMode: data.exactOut
            ? "ExactOut"
            : data.exactIn
              ? "ExactIn"
              : undefined,
          slippageBps: 10,
          maxAccounts: !data.exactOut ? 15 + attemptNum * 5 : undefined,
        }),
      3,
      200
    );
  }

  private async getJupInstructions(
    data: SwapArgs
  ): Promise<SwapInstructionsResponse> {
    if (!this.jupQuote) {
      throw new Error(
        "Fetch a quote first before getting Jupiter instructions"
      );
    }

    const instructions = await retryWithExponentialBackoff(
      async () => {
        const res = await this.jupApi.swapInstructionsPost({
          swapRequest: {
            userPublicKey: this.signer.publicKey.toString(),
            quoteResponse: this.jupQuote!,
            wrapAndUnwrapSol: data.wrapAndUnwrapSol ?? false,
            useTokenLedger: !data.exactOut && !data.exactIn,
            destinationTokenAccount: getTokenAccount(
              data.destinationWallet,
              data.outputMint
            ).toString(),
          },
        });
        if (!res) {
          throw new Error("No instructions retrieved");
        }
        return res;
      },
      4,
      200
    );
    if (!instructions.swapInstruction) {
      throw new Error("No swap instruction was returned by Jupiter");
    }
    return instructions;
  }

  private priceImpactBps() {
    return Math.round(toBps(parseFloat(this.jupQuote!.priceImpactPct))) + 1;
  }

  private adaptSlippageToPriceImpact(slippageIncFactor: number) {
    const finalPriceSlippageBps = Math.round(
      Math.max(20, this.jupQuote!.slippageBps, this.priceImpactBps()) *
        (1 + slippageIncFactor)
    );
    this.jupQuote!.slippageBps = finalPriceSlippageBps;
  }

  private addInAmountSlippagePadding() {
    consoleLog("Raw inAmount:", this.jupQuote!.inAmount);
    const inc = Math.max(
      fromBps(this.priceImpactBps()) * 1.1,
      fromBps(this.jupQuote!.slippageBps) * 0.05
    );
    consoleLog("Inc:", inc);
    this.jupQuote!.inAmount = Math.round(
      parseInt(this.jupQuote!.inAmount) +
        parseInt(this.jupQuote!.inAmount) * inc
    ).toString();
    consoleLog("Increased inAmount:", this.jupQuote!.inAmount);
  }

  async getJupSwapTransactionData(
    data: SwapArgs
  ): Promise<JupSwapTransactionData> {
    if (!this.jupQuote) {
      this.jupQuote = await this.getQuote(data);
    }

    if (data.slippageIncFactor) {
      this.adaptSlippageToPriceImpact(data.slippageIncFactor);
    }
    consoleLog("Quote:", this.jupQuote);

    const instructions = await this.getJupInstructions(data);

    if (data.exactOut) {
      this.addInAmountSlippagePadding();
    }

    return {
      lookupTableAddresses: instructions.addressLookupTableAddresses,
      setupInstructions: transactionBuilder(
        (instructions.setupInstructions ?? []).map((ix) =>
          getWrappedInstruction(this.signer, jupIxToSolanaIx(ix))
        )
      ),
      swapIx: transactionBuilder([
        getWrappedInstruction(
          this.signer,
          jupIxToSolanaIx(instructions.swapInstruction)
        ),
      ]),
      cleanupIx: transactionBuilder(
        instructions.cleanupInstruction
          ? [
              getWrappedInstruction(
                this.signer,
                jupIxToSolanaIx(instructions.cleanupInstruction)
              ),
            ]
          : []
      ),
    };
  }

  async getSwapTx(data: SwapArgs): Promise<TransactionItemInputs> {
    const swapData = await this.getJupSwapTransactionData(data);

    return {
      tx: transactionBuilder().add([
        swapData.setupInstructions,
        swapData.swapIx,
        swapData.cleanupIx,
      ]),
      lookupTableAddresses: swapData.lookupTableAddresses,
    };
  }
}
