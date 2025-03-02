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
import { consoleLog, retryWithExponentialBackoff } from "./generalUtils";
import { TOKEN_INFO } from "../constants";

const jupApi = createJupiterApiClient();

export interface JupSwapDetails {
  inputMint: PublicKey;
  outputMint: PublicKey;
  destinationWallet: PublicKey;
  amount: bigint;
  slippageIncFactor?: number;
  exactOut?: boolean;
  exactIn?: boolean;
  addPadding?: boolean;
  jupQuote?: QuoteResponse;
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
  const memecoinSwap =
    TOKEN_INFO[swapDetails.inputMint.toString()].isMeme ||
    TOKEN_INFO[swapDetails.outputMint.toString()].isMeme;

  const quoteResponse =
    swapDetails.jupQuote ??
    (await retryWithExponentialBackoff(
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
          slippageBps: memecoinSwap ? 500 : 200,
          maxAccounts: !swapDetails.exactOut ? 40 : undefined,
        }),
      4,
      200
    ));

  const priceImpactBps =
    Math.round(toBps(parseFloat(quoteResponse.priceImpactPct))) + 1;
  const finalPriceSlippageBps = Math.round(
    Math.max(50, quoteResponse.slippageBps, priceImpactBps) *
      (1 + (swapDetails.slippageIncFactor ?? 0))
  );
  quoteResponse.slippageBps = finalPriceSlippageBps;
  consoleLog(quoteResponse);

  consoleLog("Getting jup instructions...");
  const instructions = await retryWithExponentialBackoff(
    async () => {
      const res = await jupApi.swapInstructionsPost({
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

  consoleLog("Raw price impact bps:", priceImpactBps);
  const finalPriceImpactBps =
    priceImpactBps * (1 + (swapDetails.slippageIncFactor ?? 0));
  consoleLog("Increased price impact bps:", finalPriceImpactBps);

  if (swapDetails.addPadding) {
    consoleLog("Raw inAmount:", quoteResponse.inAmount);
    const inc = Math.max(
      fromBps(finalPriceImpactBps) * 1.1,
      fromBps(finalPriceSlippageBps) * 0.05
    );
    consoleLog("Inc:", inc);
    quoteResponse.inAmount = Math.round(
      parseInt(quoteResponse.inAmount) + parseInt(quoteResponse.inAmount) * inc
    ).toString();
    consoleLog("Increased inAmount:", quoteResponse.inAmount);
  }

  return {
    jupQuote: quoteResponse,
    priceImpactBps: finalPriceImpactBps,
    lookupTableAddresses: instructions.addressLookupTableAddresses,
    setupInstructions: transactionBuilder().add(
      (instructions.setupInstructions ?? []).map((ix) =>
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

export async function getJupPriceData(mints: PublicKey[], extraInfo?: boolean) {
  const data = await retryWithExponentialBackoff(async () => {
    const res = await (
      await fetch(
        "https://api.jup.ag/price/v2?ids=" +
          mints.map((x) => x.toString()).join(",") +
          (extraInfo ? "&showExtraInfo=true" : "")
      )
    ).json();
    const result = res.data;
    if (
      !result ||
      result === null ||
      (typeof result === "object" &&
        Boolean(Object.values(result).filter((x) => x === null).length)) ||
      (typeof result === "object" &&
        Object.values(result)
          .map((x) => parseFloat((x as any).price))
          .includes(0))
    ) {
      throw new Error("Failed to get token prices using Jupiter");
    }
    return result;
  }, 8);

  return data as { [key: string]: any };
}
