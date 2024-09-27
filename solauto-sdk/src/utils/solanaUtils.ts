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
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  RpcResponseAndContext,
  SimulatedTransactionResponse,
  SystemProgram,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import { getTokenAccount } from "./accountUtils";
import { arraysAreEqual, retryWithExponentialBackoff } from "./generalUtils";
import {
  getLendingAccountEndFlashloanInstructionDataSerializer,
  getLendingAccountStartFlashloanInstructionDataSerializer,
} from "../marginfi-sdk";
import { PriorityFeeSetting, TransactionRunType } from "../types";

export function getSolanaRpcConnection(
  heliusApiKey: string
): [Connection, Umi] {
  const connection = new Connection(
    `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
    "confirmed"
  );
  const umi = createUmi(connection);
  return [connection, umi];
}

export async function currentUnixSecondsSolana(umi: Umi): Promise<number> {
  return await retryWithExponentialBackoff(async () => {
    const blockTime = await umi.rpc.getBlockTime(await umi.rpc.getSlot(), { commitment: "confirmed" });
    if (blockTime === null) {
      throw new Error("Unable to retrieve block time");
    }
    return Number(blockTime);
  });
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

export async function getAdressLookupInputs(
  umi: Umi,
  lookupTableAddresses: string[]
): Promise<AddressLookupTableInput[]> {
  const addressLookupTableAccountInfos = await umi.rpc.getAccounts(
    lookupTableAddresses.map((key) => publicKey(key))
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

export function assembleFinalTransaction(
  signer: Signer,
  tx: TransactionBuilder,
  computeUnitPrice: number,
  computeUnitLimit?: number
) {
  tx = tx
    .prepend(setComputeUnitPriceUmiIx(signer, computeUnitPrice))
    .prepend(
      computeUnitLimit
        ? setComputeUnitLimitUmiIx(signer, computeUnitLimit)
        : transactionBuilder()
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
  connection: Connection,
  transaction: VersionedTransaction
): Promise<RpcResponseAndContext<SimulatedTransactionResponse>> {
  const simulationResult = await connection.simulateTransaction(transaction, {
    sigVerify: false,
    commitment: "processed",
  });
  if (simulationResult.value.err) {
    simulationResult.value.logs?.forEach((x: any) => {
      console.log(x);
    });
    throw simulationResult.value.err;
  }
  return simulationResult;
}

export async function getComputeUnitPriceEstimate(
  umi: Umi,
  tx: TransactionBuilder,
  prioritySetting: PriorityFeeSetting
): Promise<number> {
  const web3Transaction = toWeb3JsTransaction(
    (await tx.setLatestBlockhash(umi, { commitment: "finalized" })).build(umi)
  );
  const serializedTransaction = bs58.encode(web3Transaction.serialize());
  const resp = await umi.rpc.call("getPriorityFeeEstimate", [
    {
      transaction: serializedTransaction,
      options: {
        priorityLevel: prioritySetting.toString(),
      },
    },
  ]);
  const feeEstimate = Math.round((resp as any).priorityFeeEstimate as number);

  return feeEstimate;
}

export async function sendSingleOptimizedTransaction(
  umi: Umi,
  connection: Connection,
  tx: TransactionBuilder,
  txType?: TransactionRunType,
  attemptNum?: number,
  prioritySetting: PriorityFeeSetting = PriorityFeeSetting.Default,
  onAwaitingSign?: () => void
): Promise<Uint8Array | undefined> {
  console.log("Sending single optimized transaction...");
  console.log("Instructions: ", tx.getInstructions().length);
  console.log("Serialized transaction size: ", tx.getTransactionSize(umi));

  const feeEstimate = await getComputeUnitPriceEstimate(
    umi,
    tx,
    prioritySetting
  );
  console.log("Compute unit price: ", feeEstimate);

  if (txType !== "skip-simulation") {
    // TODO: we should only retry simulation if it's not a solauto error
    const simulationResult = await retryWithExponentialBackoff(
      async () =>
        await simulateTransaction(
          connection,
          toWeb3JsTransaction(
            await (
              await assembleFinalTransaction(
                umi.identity,
                tx,
                feeEstimate,
                1_400_000
              ).setLatestBlockhash(umi)
            ).build(umi)
          )
        ),
      3
    );
  
    const computeUnitLimit = Math.round(
      simulationResult.value.unitsConsumed! * 1.1
    );
    console.log("Compute unit limit: ", computeUnitLimit);
  }

  if (txType !== "only-simulate") {
    onAwaitingSign?.();
    const result = await assembleFinalTransaction(
      umi.identity,
      tx,
      feeEstimate,
      800_000
    ).sendAndConfirm(umi, {
      send: {
        skipPreflight: true,
        commitment: "confirmed",
      },
      confirm: { commitment: "confirmed" },
    });
    console.log(`https://solscan.io/tx/${bs58.encode(result.signature)}`);
    if (result.result.value.err !== null) {
      throw new Error(result.result.value.err.toString());
    }
    return result.signature;
  }

  return undefined;
}
