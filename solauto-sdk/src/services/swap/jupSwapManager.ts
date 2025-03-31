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

  async getJupSwapTransactionData(
    data: SwapArgs
  ): Promise<JupSwapTransactionData> {
    const quoteResponse = this.jupQuote ?? (await this.getQuote(data));

    const priceImpactBps =
      Math.round(toBps(parseFloat(quoteResponse.priceImpactPct))) + 1;
    const finalPriceSlippageBps = Math.round(
      Math.max(20, quoteResponse.slippageBps, priceImpactBps) *
        (1 + (data.slippageIncFactor ?? 0))
    );
    quoteResponse.slippageBps = finalPriceSlippageBps;
    consoleLog("Quote:", quoteResponse);

    const instructions = await this.getJupInstructions(data);

    consoleLog("Raw price impact bps:", priceImpactBps);
    const finalPriceImpactBps =
      priceImpactBps * (1 + (data.slippageIncFactor ?? 0));
    consoleLog("Increased price impact bps:", finalPriceImpactBps);

    if (data.exactOut) {
      consoleLog("Raw inAmount:", quoteResponse.inAmount);
      const inc = Math.max(
        fromBps(finalPriceImpactBps) * 1.1,
        fromBps(finalPriceSlippageBps) * 0.05
      );
      consoleLog("Inc:", inc);
      quoteResponse.inAmount = Math.round(
        parseInt(quoteResponse.inAmount) +
          parseInt(quoteResponse.inAmount) * inc
      ).toString();
      consoleLog("Increased inAmount:", quoteResponse.inAmount);
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
