import {
  Signer,
  TransactionBuilder,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { getWrappedInstruction } from "./solanaUtils";
import { fromBps, toBps } from "./numberUtils";
import {
  createJupiterApiClient,
  Instruction,
  QuoteResponse,
} from "@jup-ag/api";
import { getTokenAccount } from "./accountUtils";
import { retryWithExponentialBackoff } from "./generalUtils";

const jupApi = createJupiterApiClient();

export interface JupSwapDetails {
  inputMint: PublicKey;
  outputMint: PublicKey;
  destinationWallet: PublicKey;
  amount: bigint;
  slippageIncFactor?: number;
  exactOut?: boolean;
  exactIn?: boolean;
}

function createTransactionInstruction(
  instruction: Instruction
): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((key) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(instruction.data, "base64"),
  });
}

export interface JupSwapTransaction {
  jupQuote: QuoteResponse;
  priceImpactBps: number;
  lookupTableAddresses: string[];
  setupInstructions: TransactionBuilder;
  tokenLedgerIx: TransactionBuilder;
  swapIx: TransactionBuilder;
}

export async function getJupSwapTransaction(
  signer: Signer,
  swapDetails: JupSwapDetails,
  attemptNum?: number
): Promise<JupSwapTransaction> {
  console.log("Getting jup quote...");
  const quoteResponse = await retryWithExponentialBackoff(
    async () =>
      await jupApi.quoteGet({
        amount: Number(swapDetails.amount),
        inputMint: swapDetails.inputMint.toString(),
        outputMint: swapDetails.outputMint.toString(),
        swapMode: swapDetails.exactOut
          ? "ExactOut"
          : swapDetails.exactIn
            ? "ExactIn"
            : undefined,
        slippageBps: 50,
        maxAccounts: !swapDetails.exactOut ? 60 : undefined,
      }),
    3
  );

  const priceImpactBps =
    Math.round(toBps(parseFloat(quoteResponse.priceImpactPct))) + 1;
  const finalPriceSlippageBps = Math.round(
    Math.max(50, quoteResponse.slippageBps, priceImpactBps) *
      (1 + (swapDetails.slippageIncFactor ?? 0))
  );
  quoteResponse.slippageBps = finalPriceSlippageBps;
  console.log(quoteResponse);

  if (swapDetails.exactOut) {
    quoteResponse.inAmount = (
      parseInt(quoteResponse.inAmount) +
      Math.ceil(parseInt(quoteResponse.inAmount) * fromBps(finalPriceSlippageBps))
    ).toString();
  }

  console.log("Getting jup instructions...");
  const instructions = await jupApi.swapInstructionsPost({
    swapRequest: {
      userPublicKey: signer.publicKey.toString(),
      quoteResponse,
      wrapAndUnwrapSol: false,
      useTokenLedger: !swapDetails.exactOut && !swapDetails.exactIn,
      destinationTokenAccount: getTokenAccount(
        swapDetails.destinationWallet,
        swapDetails.outputMint
      ).toString(),
    },
  });

  if (!instructions.swapInstruction) {
    throw new Error("No swap instruction was returned by Jupiter");
  }

  console.log("Raw price impact bps:", priceImpactBps);
  const finalPriceImpactBps =
    priceImpactBps * (1 + (swapDetails.slippageIncFactor ?? 0));
  console.log("Increased price impact bps:", finalPriceImpactBps);

  return {
    jupQuote: quoteResponse,
    priceImpactBps: finalPriceImpactBps,
    lookupTableAddresses: instructions.addressLookupTableAddresses,
    setupInstructions: transactionBuilder().add(
      instructions.setupInstructions.map((ix) =>
        getWrappedInstruction(signer, createTransactionInstruction(ix))
      )
    ),
    tokenLedgerIx: transactionBuilder().add(
      instructions.tokenLedgerInstruction !== undefined
        ? getWrappedInstruction(
            signer,
            createTransactionInstruction(instructions.tokenLedgerInstruction)
          )
        : transactionBuilder()
    ),
    swapIx: transactionBuilder().add(
      getWrappedInstruction(
        signer,
        createTransactionInstruction(instructions.swapInstruction)
      )
    ),
  };
}
