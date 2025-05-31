import bs58 from "bs58";
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
import {
  AccountMeta,
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
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey,
  toWeb3JsTransaction,
} from "@metaplex-foundation/umi-web3js-adapters";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { PriorityFeeSetting, ProgramEnv, TransactionRunType } from "../types";
import {
  getLendingAccountEndFlashloanInstructionDataSerializer,
  getLendingAccountStartFlashloanInstructionDataSerializer,
} from "../externalSdks/marginfi";
import { getTokenAccount } from "./accountUtils";
import {
  arraysAreEqual,
  consoleLog,
  customRpcCall,
  retryWithExponentialBackoff,
} from "./generalUtils";
import { createDynamicSolautoProgram } from "./solautoUtils";
import { createDynamicMarginfiProgram } from "./marginfi";
import { usePriorityFee } from "../services";

export function getSolanaRpcConnection(
  rpcUrl: string,
  programId?: PublicKey,
  lpEnv?: ProgramEnv
): [Connection, Umi] {
  const connection = new Connection(rpcUrl, {
    commitment: "confirmed",
  });
  const umi = createUmi(connection).use({
    install(umi) {
      umi.programs.add(createDynamicSolautoProgram(programId), false);
      umi.programs.add(createDynamicMarginfiProgram(lpEnv), false);
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

export function getAccountMeta(
  pubkey: PublicKey,
  isSigner: boolean = false,
  isWritable: boolean = false
): AccountMeta {
  return { pubkey: fromWeb3JsPublicKey(pubkey), isSigner, isWritable };
}

export async function getWalletSplBalances(
  conn: Connection,
  wallet: PublicKey,
  tokenMints: PublicKey[]
): Promise<bigint[]> {
  return await Promise.all(
    tokenMints.map(async (mint) => {
      try {
        const data = await conn.getTokenAccountBalance(
          getTokenAccount(wallet, mint),
          "confirmed"
        );
        return BigInt(data.value.amount);
      } catch {
        return 0n;
      }
    })
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
  umi: Umi,
  tx: TransactionBuilder,
  computeUnitPrice?: number,
  computeUnitLimit?: number
) {
  const computePriceIx =
    computeUnitPrice !== undefined
      ? setComputeUnitPriceUmiIx(umi.identity, computeUnitPrice)
      : transactionBuilder();
  const computeLimitIx = computeUnitLimit
    ? setComputeUnitLimitUmiIx(umi.identity, computeUnitLimit)
    : transactionBuilder();

  const allOptimizations = tx.prepend(computePriceIx).prepend(computeLimitIx);
  const withCuPrice = tx.prepend(computePriceIx);
  const withCuLimit = tx.prepend(computeLimitIx);
  if (allOptimizations.fitsInOneTransaction(umi)) {
    return allOptimizations;
  } else if (withCuPrice.fitsInOneTransaction(umi)) {
    return withCuPrice;
  } else if (withCuLimit.fitsInOneTransaction(umi)) {
    return withCuLimit;
  } else {
    return tx;
  }
}

export function assembleFinalTransaction(
  umi: Umi,
  transaction: TransactionBuilder,
  computeUnitPrice?: number,
  computeUnitLimit?: number
) {
  const tx = addTxOptimizations(
    umi,
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
  return await customRpcCall(umi, "qn_estimatePriorityFees", {
    last_n_blocks: blockheight,
    account: programId.toString(),
  });
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
    const resp = await customRpcCall(umi, "getPriorityFeeEstimate", [
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
      const resp = await customRpcCall(umi, "getPriorityFeeEstimate", [
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
  let transactionSignature: string | undefined;

  const sendTx = async () => {
    try {
      const txSignature = await connection.sendRawTransaction(
        Buffer.from(transaction.serialize()),
        { skipPreflight: true, maxRetries: 3 }
      );
      if (!transactionSignature) {
        transactionSignature = txSignature;
      }
      consoleLog(`Transaction sent`);
    } catch (e) {}
  };

  await sendTx();

  const sendIntervalId = setInterval(async () => {
    await sendTx();
  }, spamInterval);

  if (!transactionSignature) {
    throw new Error("No transaction signature found");
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
  onAwaitingSign?: () => void,
  abortController?: AbortController
): Promise<Uint8Array | undefined> {
  consoleLog("Sending single optimized transaction...");
  consoleLog("Instructions: ", tx.getInstructions().length);
  consoleLog("Serialized transaction size: ", tx.getTransactionSize(umi));
  consoleLog(
    "Programs: ",
    tx.getInstructions().map((x) => x.programId)
  );

  const accounts = tx
    .getInstructions()
    .flatMap((x) => [
      x.programId.toString(),
      ...x.keys.map((y) => y.pubkey.toString()),
    ]);
  consoleLog("Unique account locks: ", Array.from(new Set(accounts)).length);

  const blockhash = await retryWithExponentialBackoff(
    async () => await connection.getLatestBlockhash("confirmed")
  );

  if (abortController?.signal.aborted) {
    return;
  }
  let cuLimit = undefined;
  if (txType !== "skip-simulation") {
    const simulationResult = await retryWithExponentialBackoff(
      async () =>
        await simulateTransaction(
          umi,
          connection,
          assembleFinalTransaction(umi, tx, undefined, 1_400_000).setBlockhash(
            blockhash
          )
        ),
      2
    );
    cuLimit = Math.round(simulationResult.value.unitsConsumed! * 1.15);
    consoleLog("Compute unit limit: ", cuLimit);
  }

  let cuPrice: number | undefined;
  if (usePriorityFee(prioritySetting)) {
    cuPrice = await getComputeUnitPriceEstimate(umi, tx, prioritySetting);
    cuPrice = Math.min(cuPrice ?? 0, 100_000_000);
    consoleLog("Compute unit price: ", cuPrice);
  }

  if (abortController?.signal.aborted) {
    return;
  }
  if (txType !== "only-simulate") {
    onAwaitingSign?.();
    const signedTx = await assembleFinalTransaction(umi, tx, cuPrice, cuLimit)
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
