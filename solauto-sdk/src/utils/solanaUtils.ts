import bs58 from "bs58";
import {
  AddressLookupTableInput,
  Signer,
  TransactionBuilder,
  Umi,
  WrappedInstruction,
  publicKey,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import {
  fromWeb3JsInstruction,
  toWeb3JsPublicKey,
  toWeb3JsTransaction,
} from "@metaplex-foundation/umi-web3js-adapters";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  AddressLookupTableAccount,
  BlockhashWithExpiryBlockHeight,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  RpcResponseAndContext,
  SimulatedTransactionResponse,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import { getTokenAccount } from "./accountUtils";
import {
  arraysAreEqual,
  consoleLog,
  retryWithExponentialBackoff,
} from "./generalUtils";
import {
  getLendingAccountEndFlashloanInstructionDataSerializer,
  getLendingAccountStartFlashloanInstructionDataSerializer,
} from "../marginfi-sdk";
import { PriorityFeeSetting, TransactionRunType } from "../types";
import { createDynamicSolautoProgram } from "./solauto";
import { SOLAUTO_PROD_PROGRAM } from "../constants";
import axios from "axios";

export function buildHeliusApiUrl(heliusApiKey: string) {
  return `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
}

export function buildIronforgeApiUrl(ironforgeApiKey: string) {
  return `https://rpc.ironforge.network/mainnet?apiKey=${ironforgeApiKey}`;
}

export function getSolanaRpcConnection(
  rpcUrl: string,
  programId: PublicKey = SOLAUTO_PROD_PROGRAM
): [Connection, Umi] {
  const connection = new Connection(rpcUrl, "confirmed");
  const umi = createUmi(connection).use({
    install(umi) {
      umi.programs.add(createDynamicSolautoProgram(programId), false);
    },
  });
  return [connection, umi];
}

export function getWrappedInstruction(
  signer: Signer,
  ix: TransactionInstruction
): WrappedInstruction {
  return {
    instruction: fromWeb3JsInstruction(ix),
    signers: [signer],
    bytesCreatedOnChain: 0,
  };
}

export function setComputeUnitLimitUmiIx(
  signer: Signer,
  maxComputeUnits: number
): WrappedInstruction {
  return getWrappedInstruction(
    signer,
    ComputeBudgetProgram.setComputeUnitLimit({
      units: maxComputeUnits,
    })
  );
}

export function setComputeUnitPriceUmiIx(
  signer: Signer,
  lamports: number
): WrappedInstruction {
  return getWrappedInstruction(
    signer,
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: lamports,
    })
  );
}

export function createAssociatedTokenAccountUmiIx(
  signer: Signer,
  wallet: PublicKey,
  mint: PublicKey
): WrappedInstruction {
  return getWrappedInstruction(
    signer,
    createAssociatedTokenAccountIdempotentInstruction(
      toWeb3JsPublicKey(signer.publicKey),
      getTokenAccount(wallet, mint),
      wallet,
      mint
    )
  );
}

export function systemTransferUmiIx(
  signer: Signer,
  destination: PublicKey,
  lamports: bigint
): WrappedInstruction {
  return getWrappedInstruction(
    signer,
    SystemProgram.transfer({
      fromPubkey: toWeb3JsPublicKey(signer.publicKey),
      toPubkey: destination,
      lamports,
    })
  );
}

export function closeTokenAccountUmiIx(
  signer: Signer,
  tokenAccount: PublicKey,
  authority: PublicKey
): WrappedInstruction {
  return getWrappedInstruction(
    signer,
    createCloseAccountInstruction(tokenAccount, authority, authority)
  );
}

export function splTokenTransferUmiIx(
  signer: Signer,
  fromTa: PublicKey,
  toTa: PublicKey,
  authority: PublicKey,
  amount: bigint
): WrappedInstruction {
  return getWrappedInstruction(
    signer,
    createTransferInstruction(fromTa, toTa, authority, amount)
  );
}

export async function getAddressLookupInputs(
  umi: Umi,
  lookupTableAddresses: string[]
): Promise<AddressLookupTableInput[]> {
  const addressLookupTableAccountInfos = await umi.rpc.getAccounts(
    lookupTableAddresses.map((key) => publicKey(key)),
    { commitment: "confirmed" }
  );

  return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
    const addressLookupTableAddress = lookupTableAddresses[index];
    if (accountInfo.exists) {
      acc.push({
        publicKey: publicKey(addressLookupTableAddress),
        addresses: AddressLookupTableAccount.deserialize(
          accountInfo.data
        ).addresses.map((x) => publicKey(x)),
      } as AddressLookupTableInput);
    }

    return acc;
  }, new Array<AddressLookupTableInput>());
}

export function addTxOptimizations(
  signer: Signer,
  transaction: TransactionBuilder,
  computeUnitPrice?: number,
  computeUnitLimit?: number
) {
  return transaction
    .prepend(
      computeUnitPrice !== undefined
        ? setComputeUnitPriceUmiIx(signer, computeUnitPrice)
        : transactionBuilder()
    )
    .prepend(
      computeUnitLimit
        ? setComputeUnitLimitUmiIx(signer, computeUnitLimit)
        : transactionBuilder()
    );
}

export function assembleFinalTransaction(
  signer: Signer,
  transaction: TransactionBuilder,
  computeUnitPrice?: number,
  computeUnitLimit?: number
) {
  const tx = addTxOptimizations(
    signer,
    transaction,
    computeUnitPrice,
    computeUnitLimit
  );

  const marginfiStartFlSerializer =
    getLendingAccountStartFlashloanInstructionDataSerializer();
  const marginfiStartFlDiscriminator = marginfiStartFlSerializer
    .serialize({
      endIndex: 0,
    })
    .slice(0, 8);

  const marginfiEndFlSerializer =
    getLendingAccountEndFlashloanInstructionDataSerializer();
  const marginfiEndFlDiscriminator = marginfiEndFlSerializer
    .serialize({
      endIndex: 0,
    })
    .slice(0, 8);

  let endFlIndex = 0;
  const instructions = tx.getInstructions();

  for (let i = instructions.length - 1; i >= 0; i--) {
    const ix = instructions[i];

    try {
      const [data, _] = marginfiStartFlSerializer.deserialize(ix.data);
      if (
        arraysAreEqual(
          data.discriminator,
          Array.from(marginfiStartFlDiscriminator)
        )
      ) {
        ix.data = marginfiStartFlSerializer.serialize({
          endIndex: endFlIndex,
        });
      }
    } catch {}

    try {
      const [data, _] = marginfiEndFlSerializer.deserialize(ix.data);
      if (
        arraysAreEqual(
          data.discriminator,
          Array.from(marginfiEndFlDiscriminator)
        )
      ) {
        endFlIndex = i;
      }
    } catch {}
  }

  return tx;
}

async function simulateTransaction(
  umi: Umi,
  connection: Connection,
  transaction: TransactionBuilder
): Promise<RpcResponseAndContext<SimulatedTransactionResponse>> {
  const simulationResult = await connection.simulateTransaction(
    toWeb3JsTransaction(transaction.build(umi)),
    {
      sigVerify: false,
      commitment: "confirmed",
    }
  );
  if (simulationResult.value.err) {
    simulationResult.value.logs?.forEach((x: any) => {
      consoleLog(x);
    });
    throw simulationResult.value.err;
  }
  return simulationResult;
}

export async function getQnComputeUnitPriceEstimate(
  umi: Umi,
  programId: PublicKey,
  blockheight: number = 50
): Promise<any> {
  return (
    await axios.post(umi.rpc.getEndpoint(), {
      method: "qn_estimatePriorityFees",
      jsonrpc: "2.0",
      id: 1,
      params: {
        last_n_blocks: blockheight,
        account: programId.toString(),
      },
    })
  ).data;
}

export async function getComputeUnitPriceEstimate(
  umi: Umi,
  tx: TransactionBuilder,
  prioritySetting: PriorityFeeSetting,
  useAccounts?: boolean
): Promise<number | undefined> {
  const web3Transaction = toWeb3JsTransaction(
    (await tx.setLatestBlockhash(umi, { commitment: "finalized" })).build(umi)
  );

  const accountKeys = tx
    .getInstructions()
    .flatMap((x) => x.keys.flatMap((x) => x.pubkey.toString()));

  let feeEstimate: number | undefined;
  try {
    const resp = await umi.rpc.call("getPriorityFeeEstimate", [
      {
        transaction: !useAccounts
          ? bs58.encode(web3Transaction.serialize())
          : undefined,
        accountKeys: useAccounts ? accountKeys : undefined,
        options: {
          priorityLevel: prioritySetting.toString(),
        },
      },
    ]);
    feeEstimate = Math.round((resp as any).priorityFeeEstimate as number);
  } catch (e) {
    try {
      const resp = await umi.rpc.call("getPriorityFeeEstimate", [
        {
          accountKeys,
          options: {
            priorityLevel: prioritySetting.toString(),
          },
        },
      ]);
      feeEstimate = Math.round((resp as any).priorityFeeEstimate as number);
    } catch (e) {
      // console.error(e);
    }
  }

  return feeEstimate;
}

async function spamSendTransactionUntilConfirmed(
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
  blockhash: BlockhashWithExpiryBlockHeight,
  spamInterval: number = 1500
): Promise<string> {
  let transactionSignature: string | null = null;

  const sendTx = async () => {
    try {
      const txSignature = await connection.sendRawTransaction(
        Buffer.from(transaction.serialize()),
        { skipPreflight: true, maxRetries: 0 }
      );
      transactionSignature = txSignature;
      consoleLog(`Transaction sent`);
    } catch (e) {}
  };

  await sendTx();

  const sendIntervalId = setInterval(async () => {
    await sendTx();
  }, spamInterval);

  if (!transactionSignature) {
    throw new Error("Failed to send");
  }

  const resp = await connection
    .confirmTransaction({
      ...blockhash,
      signature: transactionSignature,
    })
    .finally(() => {
      clearInterval(sendIntervalId);
    });

  if (resp.value.err) {
    throw resp.value.err;
  }

  return transactionSignature;
}

export async function sendSingleOptimizedTransaction(
  umi: Umi,
  connection: Connection,
  tx: TransactionBuilder,
  txType?: TransactionRunType,
  prioritySetting: PriorityFeeSetting = PriorityFeeSetting.Min,
  onAwaitingSign?: () => void
): Promise<Uint8Array | undefined> {
  consoleLog("Sending single optimized transaction...");
  consoleLog("Instructions: ", tx.getInstructions().length);
  consoleLog("Serialized transaction size: ", tx.getTransactionSize(umi));

  const accounts = tx
    .getInstructions()
    .flatMap((x) => [
      x.programId.toString(),
      ...x.keys.map((y) => y.pubkey.toString()),
    ]);
  consoleLog("Unique account locks: ", Array.from(new Set(accounts)).length);

  const blockhash = await connection.getLatestBlockhash("confirmed");

  let computeUnitLimit = undefined;
  if (txType !== "skip-simulation") {
    const simulationResult = await retryWithExponentialBackoff(
      async () =>
        await simulateTransaction(
          umi,
          connection,
          assembleFinalTransaction(
            umi.identity,
            tx,
            undefined,
            1_400_000
          ).setBlockhash(blockhash)
        ),
      3
    );
    computeUnitLimit = Math.round(simulationResult.value.unitsConsumed! * 1.15);
    consoleLog("Compute unit limit: ", computeUnitLimit);
  }

  let cuPrice: number | undefined;
  if (prioritySetting !== PriorityFeeSetting.None) {
    cuPrice = await getComputeUnitPriceEstimate(umi, tx, prioritySetting);
    if (!cuPrice) {
      cuPrice = 1_000_000;
    }
    cuPrice = Math.min(cuPrice, 100 * 1_000_000);
    consoleLog("Compute unit price: ", cuPrice);
  }

  if (txType !== "only-simulate") {
    onAwaitingSign?.();
    const signedTx = await assembleFinalTransaction(
      umi.identity,
      tx,
      cuPrice,
      computeUnitLimit
    )
      .setBlockhash(blockhash)
      .buildAndSign(umi);
    const txSig = await spamSendTransactionUntilConfirmed(
      connection,
      toWeb3JsTransaction(signedTx),
      blockhash
    );

    consoleLog(`Transaction signature: ${txSig}`);
    consoleLog(`https://solscan.io/tx/${txSig}`);
    return bs58.decode(txSig);
  }

  return undefined;
}
