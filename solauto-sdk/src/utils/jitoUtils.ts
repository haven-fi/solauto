import {
  Connection,
  PublicKey,
  SimulatedTransactionResponse,
  TransactionExpiredBlockheightExceededError,
  VersionedMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { toWeb3JsTransaction } from "@metaplex-foundation/umi-web3js-adapters";
import {
  JITO_BLOCK_ENGINE,
  JITO_TIP_ACCOUNTS,
} from "../constants/solautoConstants";
import {
  Signer,
  TransactionBuilder,
  Umi,
  WrappedInstruction,
  TransactionMessage,
  AddressLookupTableInput,
} from "@metaplex-foundation/umi";
import {
  assembleFinalTransaction,
  getComputeUnitPriceEstimate,
  sendSingleOptimizedTransaction,
  systemTransferUmiIx,
} from "./solanaUtils";
import { consoleLog, retryWithExponentialBackoff } from "./generalUtils";
import { PriorityFeeSetting, TransactionRunType } from "../types";
import axios from "axios";
import base58 from "bs58";
import { BundleSimulationError } from "../types/transactions";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

export function getRandomTipAccount(): PublicKey {
  const randomInt = Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length);
  return new PublicKey(JITO_TIP_ACCOUNTS[randomInt]);
}

function getTipInstruction(
  signer: Signer,
  tipLamports: number
): WrappedInstruction {
  return systemTransferUmiIx(
    signer,
    getRandomTipAccount(),
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

    const res = resp.data as any;

    if (res.result && res.result.value && res.result.value.summary.failed) {
      const resValue = res.result.value;
      const transactionResults =
        resValue.transactionResults as SimulatedTransactionResponse[];
      transactionResults.forEach((x) => {
        x.logs?.forEach((y) => {
          consoleLog(y);
        });
      });

      const failedTxIdx = transactionResults.length;
      const txFailure = resValue.summary.failed.error.TransactionFailure;

      if (txFailure) {
        const info = parseJitoErrorMessage(txFailure[1] as string);
        if (info) {
          throw new BundleSimulationError(
            `Failed to simulate transaction: TX: ${failedTxIdx}, IX: ${info.instructionIndex}, Error: ${info.errorCode}`,
            400,
            {
              transactionIdx: failedTxIdx,
              instructionIdx: info.instructionIndex,
              errorCode: info.errorCode,
            }
          );
        }
      }

      throw new Error(
        txFailure ? txFailure[1] : resValue.summary.failed.toString()
      );
    } else if (res.error && res.error.message) {
      throw new Error(res.error.message);
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
  userSigner: Signer,
  otherSigners: Signer[],
  txs: TransactionBuilder[],
  sign: boolean,
  feeEstimates?: number[],
  computeUnitLimits?: number[]
): Promise<VersionedTransaction[]> {
  let builtTxs = await Promise.all(
    txs.map(async (tx, i) => {
      return assembleFinalTransaction(
        userSigner,
        tx,
        feeEstimates ? feeEstimates[i] : undefined,
        computeUnitLimits ? computeUnitLimits[i] : undefined
      )
        .setBlockhash(blockhash)
        .build(umi);
    })
  );

  if (sign) {
    builtTxs = await userSigner.signAllTransactions(builtTxs);
    for (const signer of otherSigners) {
      for (let i = 0; i < builtTxs.length; i++) {
        const requiredSigners = getRequiredSigners(builtTxs[i].message);
        if (
          requiredSigners
            .map((x) => x.publicKey)
            .includes(signer.publicKey.toString())
        ) {
          builtTxs[i] = await signer.signTransaction(builtTxs[i]);
        }
      }
    }
  }

  return builtTxs.map((x) => toWeb3JsTransaction(x));
}

async function getBundleStatus(umi: Umi, bundleId: string) {
  const res = await axios.post(umi.rpc.getEndpoint(), {
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
  umi: Umi,
  bundleId: string,
  interval = 1000,
  timeout = 40000
): Promise<string[]> {
  const endTime = Date.now() + timeout;
  while (Date.now() < endTime) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    const statuses = await getBundleStatus(umi, bundleId);
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

async function sendJitoBundle(
  umi: Umi,
  transactions: string[]
): Promise<string[]> {
  let resp: any;
  try {
    resp = await axios.post<{ result: string }>(umi.rpc.getEndpoint(), {
      jsonrpc: "2.0",
      id: 1,
      method: "sendBundle",
      params: [transactions],
    });
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
  return bundleId ? await pollBundleStatus(umi, bundleId) : [];
}

export function getRequiredSigners(message: TransactionMessage) {
  const { numRequiredSignatures, numReadonlySignedAccounts } = message.header;

  const numWritableSigners = numRequiredSignatures - numReadonlySignedAccounts;

  const signersInfo = [];
  for (let i = 0; i < numRequiredSignatures; i++) {
    const publicKey = message.accounts[i].toString();
    const isWritable = i < numWritableSigners;

    signersInfo.push({
      index: i,
      publicKey,
      isWritable,
    });
  }

  return signersInfo;
}

export async function sendJitoBundledTransactions(
  umi: Umi,
  connection: Connection,
  userSigner: Signer,
  otherSigners: Signer[],
  txs: TransactionBuilder[],
  txType?: TransactionRunType,
  priorityFeeSetting: PriorityFeeSetting = PriorityFeeSetting.Min,
  onAwaitingSign?: () => void
): Promise<string[] | undefined> {
  if (txs.length === 1) {
    const resp = await sendSingleOptimizedTransaction(
      umi,
      connection,
      txs[0],
      txType,
      priorityFeeSetting,
      onAwaitingSign
    );
    return resp ? [bs58.encode(resp)] : undefined;
  }

  consoleLog("Sending Jito bundle...");
  consoleLog("Transactions: ", txs.length);
  consoleLog(
    txs.map((tx) => tx.getInstructions().map((x) => x.programId.toString()))
  );
  consoleLog(
    "Transaction sizes: ",
    txs.map((x) => x.getTransactionSize(umi))
  );

  txs[0] = txs[0].prepend(getTipInstruction(userSigner, 150_000));
  const feeEstimates =
    priorityFeeSetting !== PriorityFeeSetting.None
      ? await Promise.all(
          txs.map(
            async (x) =>
              (await getComputeUnitPriceEstimate(
                umi,
                x,
                priorityFeeSetting,
                true
              )) ?? 1000000
          )
        )
      : undefined;

  const latestBlockhash = (
    await umi.rpc.getLatestBlockhash({ commitment: "confirmed" })
  ).blockhash;

  let builtTxs: VersionedTransaction[] = [];
  let simulationResults: SimulatedTransactionResponse[] | undefined;
  if (txType !== "skip-simulation") {
    builtTxs = await umiToVersionedTransactions(
      umi,
      latestBlockhash,
      userSigner,
      otherSigners,
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
    onAwaitingSign?.();

    builtTxs = await umiToVersionedTransactions(
      umi,
      latestBlockhash,
      userSigner,
      otherSigners,
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

    const txSigs = await sendJitoBundle(
      umi,
      serializedTxs.map((x) => base58.encode(x))
    );
    return txSigs.length > 0 ? txSigs : undefined;
  }

  return undefined;
}
