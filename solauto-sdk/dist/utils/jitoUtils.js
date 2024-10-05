"use strict";
// import { SolautoClient } from "../clients/solautoClient";
// import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
// import { SimulatedBundleTransactionResult } from "jito-ts";
// import { toWeb3JsTransaction } from "@metaplex-foundation/umi-web3js-adapters";
// import {
//   JITO_BLOCK_ENGINE,
//   JITO_CONNECTION,
//   UMI,
// } from "../constants/solautoConstants";
// import {
//   Signer,
//   TransactionBuilder,
//   WrappedInstruction,
// } from "@metaplex-foundation/umi";
// import {
//   assembleFinalTransaction,
//   getComputeUnitPriceEstimate,
//   getSecretKey,
//   systemTransferUmiIx,
// } from "./solanaUtils";
// import { Bundle } from "jito-ts/dist/sdk/block-engine/types";
// import {
//   SearcherClient,
//   searcherClient,
// } from "jito-ts/dist/sdk/block-engine/searcher";
// import { BundleResult } from "jito-ts/dist/gen/block-engine/bundle";
// export function getSearcherClient(): SearcherClient {
//   return searcherClient(
//     JITO_BLOCK_ENGINE,
//     Keypair.fromSecretKey(getSecretKey("jito-bundles"))
//   );
// }
// export async function getRandomTipAccount(): Promise<PublicKey> {
//   const tipAccounts = await getSearcherClient().getTipAccounts();
//   const randomInt = Math.floor(Math.random() * tipAccounts.length);
//   return new PublicKey(tipAccounts[randomInt]);
// }
// export async function waitUntilJitoNextLeader(
//   distanceFromJitoSlot: number = 5
// ) {
//   let searcher = getSearcherClient();
//   let isLeaderSlot = false;
//   while (!isLeaderSlot) {
//     const nextLeader = await searcher.getNextScheduledLeader();
//     const numSlots = nextLeader.nextLeaderSlot - nextLeader.currentSlot;
//     isLeaderSlot = numSlots <= distanceFromJitoSlot && numSlots > 1;
//     consoleLog(`Next jito leader slot in ${numSlots} slots`);
//     await new Promise((r) => setTimeout(r, 500));
//   }
// }
// async function getTipInstruction(
//   client: SolautoClient,
//   tipLamports: number
// ): Promise<WrappedInstruction> {
//   return systemTransferUmiIx(
//     client.signer,
//     await getRandomTipAccount(),
//     BigInt(tipLamports)
//   );
// }
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
// async function umiToVersionedTransactions(
//   signer: Signer,
//   txs: TransactionBuilder[],
//   feeEstimates: number[],
//   computeUnitLimits?: number[]
// ): Promise<VersionedTransaction[]> {
//   return await Promise.all(
//     txs.map(async (tx, i) => {
//       const versionedTx = toWeb3JsTransaction(
//         await (
//           await assembleFinalTransaction(
//             signer,
//             tx,
//             feeEstimates[i],
//             computeUnitLimits ? computeUnitLimits[i] : undefined
//           ).setLatestBlockhash(UMI)
//         ).buildAndSign(UMI)
//       );
//       return versionedTx;
//     })
//   );
// }
// async function sendJitoBundle(bundle: Bundle): Promise<BundleResult> {
//   await waitUntilJitoNextLeader();
//   let searcher = getSearcherClient();
//   consoleLog("Sending bundle...");
//   try {
//     const resp = await searcher.sendBundle(bundle);
//     consoleLog("Send bundle response:", resp);
//   } catch (e) {
//     console.error("Error sending bundle:", e);
//   }
//   return await new Promise((resolve, reject) => {
//     searcher.onBundleResult(
//       (res) => {
//         if (res.accepted || res.processed || res.finalized) {
//           resolve(res);
//         } else {
//           consoleLog(res);
//           return reject("Bundle not accepted");
//         }
//       },
//       (err) => {
//         consoleLog("Error: ", err);
//         return reject(err);
//       }
//     );
//   });
// }
// interface JitoTransactionsResult {
//   bundleResult: BundleResult;
//   txSigs: Uint8Array[];
// }
// export async function sendJitoBundledTransactions(
//   client: SolautoClient,
//   txs: TransactionBuilder[],
//   simulateOnly?: boolean
// ): Promise<JitoTransactionsResult | undefined> {
//   client.log("Sending Jito bundle...");
//   client.log("Transactions: ", txs.length);
//   client.log(
//     "Transaction sizes: ",
//     txs.map((x) => x.getTransactionSize(UMI))
//   );
//   txs[0] = txs[0].prepend(await getTipInstruction(client, 1000000));
//   const feeEstimates = await Promise.all(txs.map(getComputeUnitPriceEstimate));
//   let builtTxs = await umiToVersionedTransactions(
//     client.signer,
//     txs,
//     feeEstimates,
//     // Array(txs.length).fill(1_400_000)
//   );
//   // // TODO: Skip over this for now, and instead don't specify a compute unit limit in the final bundle transactions
//   // const simulationResults = await simulateJitoBundle(builtTxs);
//   if (!simulateOnly) {
//     // let builtTxs = await umiToVersionedTransactions(
//     //   client.signer,
//     //   txs,
//     //   feeEstimates,
//     //   simulationResults.map((x) => x.unitsConsumed! * 1.15)
//     // );
//     const bundleResult = await sendJitoBundle(
//       new Bundle(builtTxs, 100)
//     );
//     return {
//       bundleResult,
//       txSigs: builtTxs.map((x) => x.signatures).flat(),
//     };
//   }
//   return undefined;
// }
