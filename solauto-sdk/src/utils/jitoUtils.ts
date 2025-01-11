import {
  PublicKey,
  SimulatedTransactionResponse,
  TransactionExpiredBlockheightExceededError,
  VersionedTransaction,
} from "@solana/web3.js";
import { toWeb3JsTransaction } from "@metaplex-foundation/umi-web3js-adapters";
import { JITO_BLOCK_ENGINE } from "../constants/solautoConstants";
import {
  Signer,
  TransactionBuilder,
  Umi,
  WrappedInstruction,
} from "@metaplex-foundation/umi";
import {
  assembleFinalTransaction,
  getComputeUnitPriceEstimate,
  systemTransferUmiIx,
} from "./solanaUtils";
import { consoleLog, retryWithExponentialBackoff } from "./generalUtils";
import { PriorityFeeSetting, TransactionRunType } from "../types";
import axios from "axios";
import base58 from "bs58";
import { BundleSimulationError } from "../types/transactions";

export async function getRandomTipAccount(): Promise<PublicKey> {
  const tipAccounts = [
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
  ];
  const randomInt = Math.floor(Math.random() * tipAccounts.length);
  return new PublicKey(tipAccounts[randomInt]);
}

async function getTipInstruction(
  signer: Signer,
  tipLamports: number
): Promise<WrappedInstruction> {
  return systemTransferUmiIx(
    signer,
    await getRandomTipAccount(),
    BigInt(tipLamports)
  );
}

function parseJitoErrorMessage(message: string) {
  const regex =
    /Error processing Instruction (\d+): custom program error: (0x[0-9A-Fa-f]+|\d+)/;
  const match = message.match(regex);

  if (match) {
    const instructionIndex = parseInt(match[1], 10);

    let errorCode: number;
    if (match[2].toLowerCase().startsWith("0x")) {
      errorCode = parseInt(match[2], 16);
    } else {
      errorCode = parseInt(match[2], 10);
    }

    return {
      instructionIndex,
      errorCode,
    };
  } else {
    return null;
  }
}

async function simulateJitoBundle(umi: Umi, txs: VersionedTransaction[]) {
  const simulationResult = await retryWithExponentialBackoff(async () => {
    const resp = await axios.post(
      umi.rpc.getEndpoint(),
      {
        jsonrpc: "2.0",
        id: 1,
        method: "simulateBundle",
        params: [
          {
            encodedTransactions: txs.map((x) =>
              Buffer.from(x.serialize()).toString("base64")
            ),
          },
          {
            encoding: "base64",
            commitment: "confirmed",
            preExecutionAccountsConfigs: txs.map((_) => {}),
            postExecutionAccountsConfigs: txs.map((_) => {}),
            skipSigVerify: true,
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const res = resp.data.result.value as any;

    if (res && res.summary.failed) {
      const transactionResults =
        res.transactionResults as SimulatedTransactionResponse[];
      transactionResults.forEach((x) => {
        x.logs?.forEach((y) => {
          consoleLog(y);
        });
      });

      const failedTxIdx = transactionResults.length;
      const txFailure = res.summary.failed.error.TransactionFailure;

      if (txFailure) {
        const info = parseJitoErrorMessage(txFailure[1] as string);
        if (info) {
          throw new BundleSimulationError("Failed to simulate transaction", 400, {
            transactionIdx: failedTxIdx,
            instructionIdx: info.instructionIndex,
            errorCode: info.errorCode,
          });
        }
      }

      throw new Error(txFailure ? txFailure[1] : res.summary.failed.toString());
    }

    return res;
  });

  const transactionResults =
    simulationResult.transactionResults as SimulatedTransactionResponse[];

  return transactionResults;
}

async function umiToVersionedTransactions(
  umi: Umi,
  blockhash: string,
  signer: Signer,
  txs: TransactionBuilder[],
  sign: boolean,
  feeEstimates?: number[],
  computeUnitLimits?: number[]
): Promise<VersionedTransaction[]> {
  let builtTxs = await Promise.all(
    txs.map(async (tx, i) => {
      return assembleFinalTransaction(
        signer,
        tx,
        feeEstimates ? feeEstimates[i] : undefined,
        computeUnitLimits ? computeUnitLimits[i] : undefined
      )
        .setBlockhash(blockhash)
        .build(umi);
    })
  );

  if (sign) {
    builtTxs = await signer.signAllTransactions(builtTxs);
  }

  return builtTxs.map((x) => toWeb3JsTransaction(x));
}

async function getBundleStatus(bundleId: string) {
  const res = await axios.post(`${JITO_BLOCK_ENGINE}/api/v1/bundles`, {
    jsonrpc: "2.0",
    id: 1,
    method: "getBundleStatuses",
    params: [[bundleId]],
  });
  if (res.data.error) {
    throw new Error(`Failed to get bundle status: ${res.data.error}`);
  }

  return res.data.result;
}

async function pollBundleStatus(
  bundleId: string,
  interval = 1000,
  timeout = 40000
): Promise<string[]> {
  const endTime = Date.now() + timeout;
  while (Date.now() < endTime) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    const statuses = await getBundleStatus(bundleId);
    if (statuses?.value?.length > 0) {
      consoleLog("Statuses:", statuses);
      const status = statuses.value[0].confirmation_status;
      if (status === "confirmed") {
        return statuses.value[0].transactions as string[];
      }
      const err = statuses.value[0].err;
      if (err) {
        consoleLog("Jito bundle err:", JSON.stringify(err, null, 2));
        throw new Error(err);
      }
    }
  }
  throw new TransactionExpiredBlockheightExceededError(
    "Unable to confirm transaction. Try a higher priority fee."
  );
}

async function sendJitoBundle(transactions: string[]): Promise<string[]> {
  let resp: any;
  try {
    resp = await axios.post<{ result: string }>(
      `${JITO_BLOCK_ENGINE}/api/v1/bundles`,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "sendBundle",
        params: [transactions],
      }
    );
  } catch (e: any) {
    if (e.response.data.error) {
      console.error("Jito send bundle error:", e.response.data.error);
      throw new Error(e.response.data.error.message);
    } else {
      throw e;
    }
  }

  const bundleId = resp.data.result;
  consoleLog("Bundle ID:", bundleId);
  return bundleId ? await pollBundleStatus(bundleId) : [];
}

export async function sendJitoBundledTransactions(
  umi: Umi,
  signer: Signer,
  txs: TransactionBuilder[],
  txType?: TransactionRunType,
  priorityFeeSetting: PriorityFeeSetting = PriorityFeeSetting.Min,
  onAwaitingSign?: () => void
): Promise<string[] | undefined> {
  consoleLog("Sending Jito bundle...");
  consoleLog("Transactions: ", txs.length);
  consoleLog(
    "Transaction sizes: ",
    txs.map((x) => x.getTransactionSize(umi))
  );

  txs[0] = txs[0].prepend(await getTipInstruction(signer, 150_000));
  const feeEstimates =
    priorityFeeSetting !== PriorityFeeSetting.None
      ? await Promise.all(
          txs.map(
            async (x) =>
              (await getComputeUnitPriceEstimate(umi, x, priorityFeeSetting)) ??
              1000000
          )
        )
      : undefined;

  const latestBlockhash = (
    await umi.rpc.getLatestBlockhash({ commitment: "confirmed" })
  ).blockhash;

  let builtTxs: VersionedTransaction[];
  let simulationResults: SimulatedTransactionResponse[] | undefined;
  if (txType !== "skip-simulation") {
    builtTxs = await umiToVersionedTransactions(
      umi,
      latestBlockhash,
      signer,
      txs,
      false,
      feeEstimates
    );
    consoleLog(
      builtTxs.map((x) =>
        x.message.compiledInstructions.map((y) =>
          x.message.staticAccountKeys[y.programIdIndex].toString()
        )
      )
    );
    simulationResults = await simulateJitoBundle(umi, builtTxs);
  }

  if (txType !== "only-simulate") {
    builtTxs = await umiToVersionedTransactions(
      umi,
      latestBlockhash,
      signer,
      txs,
      true,
      feeEstimates,
      simulationResults
        ? simulationResults.map((x) => x.unitsConsumed! * 1.15)
        : undefined
    );

    const serializedTxs = builtTxs.map((x) => x.serialize());
    if (serializedTxs.find((x) => x.length > 1232)) {
      throw new Error("A transaction is too large");
    }

    onAwaitingSign?.();
    const txSigs = await sendJitoBundle(
      serializedTxs.map((x) => base58.encode(x))
    );
    return txSigs.length > 0 ? txSigs : undefined;
  }

  return undefined;
}
