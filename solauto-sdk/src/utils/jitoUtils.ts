import {
  Connection,
  PublicKey,
  SimulatedTransactionResponse,
  TransactionExpiredBlockheightExceededError,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  Signer,
  TransactionBuilder,
  Umi,
  WrappedInstruction,
  TransactionMessage,
} from "@metaplex-foundation/umi";
import { toWeb3JsTransaction } from "@metaplex-foundation/umi-web3js-adapters";
import { JITO_TIP_ACCOUNTS } from "../constants";
import { PriorityFeeSetting, TransactionRunType } from "../types";
import { BundleSimulationError } from "../types";
import {
  assembleFinalTransaction,
  getComputeUnitPriceEstimate,
  sendSingleOptimizedTransaction,
  systemTransferUmiIx,
} from "./solanaUtils";
import {
  consoleLog,
  customRpcCall,
  retryWithExponentialBackoff,
} from "./generalUtils";
import base58 from "bs58";
import { usePriorityFee } from "../services";

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
    const res = await customRpcCall(umi, "simulateBundle", [
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
    ]);

    if (res.value && res.value.summary.failed) {
      const transactionResults = res.value
        .transactionResults as SimulatedTransactionResponse[];
      transactionResults.forEach((x) => {
        x.logs?.forEach((y) => {
          consoleLog(y);
        });
      });

      const failedTxIdx = transactionResults.length;
      const txFailure = res.value.summary.failed.error.TransactionFailure;

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
        txFailure ? txFailure[1] : res.value.summary.failed.toString()
      );
    } else if (res.error && res.error.message) {
      throw new Error(res.error.message);
    }

    return res.value;
  }, 2);

  const transactionResults =
    simulationResult.transactionResults as SimulatedTransactionResponse[];

  return transactionResults;
}

export function getAdditionalSigners(message: TransactionMessage) {
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
  let builtTxs = txs.map((tx, i) =>
    assembleFinalTransaction(
      umi,
      tx,
      feeEstimates ? feeEstimates[i] : undefined,
      computeUnitLimits ? computeUnitLimits[i] : undefined
    )
      .setBlockhash(blockhash)
      .build(umi)
  );

  if (sign) {
    builtTxs = await userSigner.signAllTransactions(builtTxs);
    for (const signer of otherSigners) {
      for (let i = 0; i < builtTxs.length; i++) {
        const requiredSigners = getAdditionalSigners(builtTxs[i].message);
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
  const res = await customRpcCall(umi, "getBundleStatuses", [[bundleId]]);
  if (res.error) {
    throw new Error(`Failed to get bundle status: ${res.error}`);
  }
  return res;
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

    const statuses = await retryWithExponentialBackoff(
      async () => {
        const resp = await getBundleStatus(umi, bundleId);
        if (resp?.value?.length > 0 && resp.value[0] === null) {
          throw new Error("No confirmation status");
        }
        return resp;
      },
      3,
      250
    );

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
    resp = await customRpcCall(umi, "sendBundle", [transactions]);
  } catch (e: any) {
    if (e.response.data.error) {
      console.error("Jito send bundle error:", e.response.data.error);
      throw new Error(e.response.data.error.message);
    } else {
      throw e;
    }
  }

  if (resp.error?.message === "All providers failed") {
    throw new Error(resp.error.responses[0].response.error.message);
  } else if (resp.error) {
    throw new Error(resp.error);
  }

  const bundleId = resp as string;
  consoleLog("Bundle ID:", bundleId);
  return bundleId ? await pollBundleStatus(umi, bundleId) : [];
}

export async function sendJitoBundledTransactions(
  umi: Umi,
  connection: Connection,
  userSigner: Signer,
  otherSigners: Signer[],
  transactions: TransactionBuilder[],
  txType?: TransactionRunType,
  priorityFeeSetting: PriorityFeeSetting = PriorityFeeSetting.Min,
  onAwaitingSign?: () => void,
  abortController?: AbortController
): Promise<string[] | undefined> {
  const txs = [...transactions];

  if (txs.length === 1) {
    const resp = await sendSingleOptimizedTransaction(
      umi,
      connection,
      txs[0],
      txType,
      priorityFeeSetting,
      onAwaitingSign,
      abortController
    );
    return resp ? [base58.encode(resp)] : undefined;
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

  txs[0] = txs[0].prepend(getTipInstruction(userSigner, 250_000));

  const latestBlockhash = (
    await umi.rpc.getLatestBlockhash({ commitment: "confirmed" })
  ).blockhash;

  if (abortController?.signal.aborted) {
    return;
  }

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
      undefined,
      Array(txs.length).fill(null).map((_) => 1_400_000)
    );
    simulationResults = await simulateJitoBundle(umi, builtTxs);
  }

  const feeEstimates = usePriorityFee(priorityFeeSetting)
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

  if (abortController?.signal.aborted) {
    return;
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
    consoleLog(
      builtTxs.map((x) =>
        x.message.compiledInstructions.map((y) =>
          x.message.staticAccountKeys[y.programIdIndex].toString()
        )
      )
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
