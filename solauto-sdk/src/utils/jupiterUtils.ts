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
import {
  consoleLog,
  retryWithExponentialBackoff,
  tokenInfo,
} from "./generalUtils";

const jupApi = createJupiterApiClient();

export interface JupSwapInput {
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: bigint;
  exactIn?: boolean;
  exactOut?: boolean;
}

export interface JupSwapDetails extends JupSwapInput {
  destinationWallet: PublicKey;
  slippageIncFactor?: number;
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

export async function getJupQuote(swapDetails: JupSwapInput) {
  const memecoinSwap =
    tokenInfo(swapDetails.inputMint).isMeme ||
    tokenInfo(swapDetails.outputMint).isMeme;

  return await retryWithExponentialBackoff(
    async (attemptNum: number) =>
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
        maxAccounts: !swapDetails.exactOut ? 15 + attemptNum * 5 : undefined,
      }),
    3,
    200
  );
}

export interface JupSwapTransaction {
  jupQuote: QuoteResponse;
  priceImpactBps: number;
  lookupTableAddresses: string[];
  setupInstructions: TransactionBuilder;
  tokenLedgerIx?: TransactionBuilder;
  swapIx: TransactionBuilder;
}

export async function getJupSwapTransaction(
  signer: Signer,
  swapDetails: JupSwapDetails,
  attemptNum?: number
): Promise<JupSwapTransaction> {
  const quoteResponse =
    swapDetails.jupQuote ?? (await getJupQuote(swapDetails));

  const priceImpactBps =
    Math.round(toBps(parseFloat(quoteResponse.priceImpactPct))) + 1;
  const finalPriceSlippageBps = Math.round(
    Math.max(50, quoteResponse.slippageBps, priceImpactBps) *
      (1 + (swapDetails.slippageIncFactor ?? 0))
  );
  quoteResponse.slippageBps = finalPriceSlippageBps;
  consoleLog("Quote:", quoteResponse);

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
    tokenLedgerIx:
      instructions.tokenLedgerInstruction !== undefined
        ? transactionBuilder().add(
            getWrappedInstruction(
              signer,
              createTransactionInstruction(instructions.tokenLedgerInstruction)
            )
          )
        : undefined,
    swapIx: transactionBuilder().add(
      getWrappedInstruction(
        signer,
        createTransactionInstruction(instructions.swapInstruction)
      )
    ),
  };
}

export async function getJupPriceData(
  mints: PublicKey[],
  mayIncludeSpamTokens?: boolean
) {
  const data = await retryWithExponentialBackoff(async () => {
    const res = await (
      await fetch(
        "https://api.jup.ag/price/v2?ids=" +
          mints.map((x) => x.toString()).join(",") +
          "&showExtraInfo=true"
      )
    ).json();
    const result = res.data;
    if (!result || result === null || typeof result !== "object") {
      throw new Error("Failed to get token prices using Jupiter");
    }

    const invalidValues =
      Boolean(Object.values(result).filter((x) => x === null).length) ||
      Boolean(
        Object.values(result)
          .map((x) => parseFloat((x as any).price))
          .filter((x) => x <= 0).length
      );
    if (invalidValues && !mayIncludeSpamTokens) {
      throw new Error("Invalid price values");
    }

    const trueData: { [key: string]: any } = Object.entries(
      result as { [key: string]: any }
    ).reduce(
      (acc, [key, val]) =>
        !val?.extraInfo?.quotedPrice?.sellAt
          ? { ...acc, [key]: { ...val, price: "0" } }
          : { ...acc, [key]: val },
      {}
    );

    return trueData;
  }, 8);

  return data;
}
