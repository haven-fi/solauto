import { PublicKey, VersionedTransaction } from "@solana/web3.js";
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
import { consoleLog } from "./generalUtils";
import { PriorityFeeSetting } from "../types";
import axios from "axios";
import base58 from "bs58";

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

// async function simulateJitoBundle(
//   txs: VersionedTransaction[]
// ): Promise<SimulatedBundleTransactionResult[]> {
//   const simulationResult = await JITO_CONNECTION.simulateBundle(txs, {
//     preExecutionAccountsConfigs: txs.map((x) => null),
//     postExecutionAccountsConfigs: txs.map((x) => null),
//     skipSigVerify: true,
//   });

//   simulationResult.value.transactionResults.forEach((tx) => {
//     if (tx.err) {
//       tx.logs?.forEach((x) => {
//         consoleLog(x);
//       });
//       throw tx.err;
//     }
//   });

//   return simulationResult.value.transactionResults;
// }

async function umiToVersionedTransactions(
  umi: Umi,
  signer: Signer,
  txs: TransactionBuilder[],
  feeEstimates: number[],
  computeUnitLimits?: number[]
): Promise<VersionedTransaction[]> {
  return await Promise.all(
    txs.map(async (tx, i) => {
      const versionedTx = toWeb3JsTransaction(
        await (
          await assembleFinalTransaction(
            signer,
            tx,
            feeEstimates[i],
            computeUnitLimits ? computeUnitLimits[i] : undefined
          ).setLatestBlockhash(umi)
        ).buildAndSign(umi)
      );
      return versionedTx;
    })
  );
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
      const status = statuses.value[0].confirmation_status;
      if (status === "confirmed") {
        return statuses?.value[0].transactions as string[];
      }
    }
  }
  return [];
}

async function sendJitoBundle(transactions: string[]): Promise<string[]> {
  const resp = await axios.post<{ result: string }>(
    `${JITO_BLOCK_ENGINE}/api/v1/bundles`,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "sendBundle",
      params: [transactions],
    }
  );

  const bundleId = resp.data.result;
  consoleLog("Bundle ID:", bundleId);
  return bundleId ? await pollBundleStatus(bundleId) : [];
}

export async function sendJitoBundledTransactions(
  umi: Umi,
  signer: Signer,
  txs: TransactionBuilder[],
  simulateOnly?: boolean,
  priorityFeeSetting: PriorityFeeSetting = PriorityFeeSetting.Min
): Promise<string[] | undefined> {
  consoleLog("Sending Jito bundle...");
  consoleLog("Transactions: ", txs.length);
  consoleLog(
    "Transaction sizes: ",
    txs.map((x) => x.getTransactionSize(umi))
  );

  txs[0] = txs[0].prepend(await getTipInstruction(signer, 150_000));
  const feeEstimates = await Promise.all(
    txs.map(
      async (x) =>
        (await getComputeUnitPriceEstimate(umi, x, priorityFeeSetting, true)) ??
        1000000
    )
  );

  let builtTxs = await umiToVersionedTransactions(
    umi,
    signer,
    txs,
    feeEstimates
    // Array(txs.length).fill(1_400_000)
  );
  // // TODO: Skip over this for now, and instead don't specify a compute unit limit in the final bundle transactions
  // const simulationResults = await simulateJitoBundle(builtTxs);

  if (!simulateOnly) {
    // let builtTxs = await umiToVersionedTransactions(
    //   client.signer,
    //   txs,
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
