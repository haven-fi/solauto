import path from "path";
import fs from "fs";
import {
  Keypair,
  AddressLookupTableProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  PublicKey,
} from "@solana/web3.js";
import { getSolanaRpcConnection } from "../src/utils/solanaUtils";

function loadSecretKey(keypairPath: string) {
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
  return new Uint8Array(secretKey);
}

export function getSecretKey(keypairFilename: string = "id"): Uint8Array {
  return loadSecretKey(
    path.join(process.env.HOME!, ".config", "solana", keypairFilename + ".json")
  );
}

const keypair = Keypair.fromSecretKey(getSecretKey());
const [connection, _] = getSolanaRpcConnection(process.env.HELIUS_API_KEY ?? "");

async function createAndSendV0Tx(txInstructions: TransactionInstruction[]) {
  let latestBlockhash = await connection.getLatestBlockhash("finalized");

  const messageV0 = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: txInstructions,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(messageV0);

  transaction.sign([keypair]);

  const txid = await connection.sendTransaction(transaction, {
    maxRetries: 5,
  });

  const confirmation = await connection.confirmTransaction({
    signature: txid,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });
  if (confirmation.value.err) {
    throw new Error(confirmation.value.err.toString());
  }
  console.log(txid);
}

async function addAddressesIfNeeded(
  lookupTableAddress: PublicKey,
  existingAddresses: string[],
  addressesToAdd: string[]
) {
  const addresses = addressesToAdd
    .filter((x) => !existingAddresses.includes(x))
    .map((x) => new PublicKey(x));

  if (addresses.length > 0) {
    await createAndSendV0Tx([
      AddressLookupTableProgram.extendLookupTable({
        payer: keypair.publicKey,
        authority: keypair.publicKey,
        lookupTable: lookupTableAddress,
        addresses,
      }),
    ]);
  }
}

export async function updateLookupTable(
  accounts: string[],
  lookupTableAddress?: PublicKey
) {
  let lookupTable = lookupTableAddress
    ? await connection.getAddressLookupTable(lookupTableAddress)
    : null;
  if (lookupTable === null) {
    const [createLutIx, addr] = AddressLookupTableProgram.createLookupTable({
      authority: keypair.publicKey,
      payer: keypair.publicKey,
      recentSlot: await connection.getSlot({ commitment: "finalized" }),
    });
    lookupTableAddress = addr;
    console.log("Lookup Table Address:", lookupTableAddress.toString());
    createAndSendV0Tx([createLutIx]);
  }

  const existingAccounts =
    lookupTable?.value?.state.addresses.map((x) => x.toString()) ?? [];
  console.log("Existing accounts: ", existingAccounts.length);

  await addAddressesIfNeeded(lookupTableAddress!, existingAccounts, accounts);
}
