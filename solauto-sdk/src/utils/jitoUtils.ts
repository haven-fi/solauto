import { Connection, PublicKey, TransactionExpiredBlockheightExceededError, VersionedTransaction } from "@solana/web3.js";
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
  buildIronforgeApiUrl,
  getComputeUnitPriceEstimate,
  sendSingleOptimizedTransaction,
  systemTransferUmiIx,
} from "./solanaUtils";
import { consoleLog } from "./generalUtils";
import { PriorityFeeSetting, TransactionRunType } from "../types";
import axios from "axios";
import base58 from "bs58";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

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

// TODO: fix
// async function simulateJitoBundle(umi: Umi, txs: VersionedTransaction[]) {
//   const simulationResult = await axios.post(
//     `${JITO_BLOCK_ENGINE}/api/v1/bundles`,
//     {
//       method: "simulateBundle",
//       id: 1,
//       jsonrpc: "2.0",
//       params: [
//         {
//           encodedTransactions: txs.map((x) => bs58.encode(x.serialize())),
//           preExecutionAccountsConfigs: txs.map((_) => ""),
//           postExecutionAccountsConfigs: txs.map((_) => ""),
//           skipSigVerify: true,
//         },
//       ],
//     }
//   );
// }

async function umiToVersionedTransactions(
  umi: Umi,
  signer: Signer,
  txs: TransactionBuilder[],
  sign: boolean,
  feeEstimates?: number[],
  computeUnitLimits?: number[]
): Promise<VersionedTransaction[]> {
  let builtTxs = await Promise.all(
    txs.map(async (tx, i) => {
      return (
        await assembleFinalTransaction(
          signer,
          tx,
          feeEstimates ? feeEstimates[i] : undefined,
          computeUnitLimits ? computeUnitLimits[i] : undefined
        ).setLatestBlockhash(umi)
      ).build(umi);
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
        return statuses?.value[0].transactions as string[];
      }
    }
  }
  throw new TransactionExpiredBlockheightExceededError("Unable to confirm transaction. Try a higher priority fee.");
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
  connection: Connection,
  signer: Signer,
  txs: TransactionBuilder[],
  txType?: TransactionRunType,
  priorityFeeSetting: PriorityFeeSetting = PriorityFeeSetting.Min
): Promise<string[] | undefined> {
  if (txs.length === 1) {
    const res = await sendSingleOptimizedTransaction(
      umi,
      connection,
      txs[0],
      txType,
      priorityFeeSetting
    );
    return res ? [bs58.encode(res)] : undefined;
  }

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

  let builtTxs = await umiToVersionedTransactions(
    umi,
    signer,
    txs,
    true, // false if simulating first and rebuilding later
    feeEstimates
  );

  // const simulationResults = await simulateJitoBundle(umi, builtTxs);

  if (txType !== "only-simulate") {
    // let builtTxs = await umiToVersionedTransactions(
    //   client.signer,
    //   txs,
    //   true,
    //   feeEstimates,
    //   simulationResults.map((x) => x.unitsConsumed! * 1.15)
    // );

    const txSigs = await sendJitoBundle(
      builtTxs.map((x) => base58.encode(x.serialize()))
    );
    return txSigs.length > 0 ? txSigs : undefined;
  }

  return undefined;
}
