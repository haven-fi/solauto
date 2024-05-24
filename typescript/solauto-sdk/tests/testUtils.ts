import { UmiPlugin } from "@metaplex-foundation/umi";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import { assert } from "chai";
import { createSolautoProgram } from "../src/generated";

export function loadSecretKey(keypairPath: string) {
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
  return new Uint8Array(secretKey);
}

export function getSecretKey(keypairFilename: string = "id"): Uint8Array {
  return loadSecretKey(
    path.join(process.env.HOME!, ".config", "solana", keypairFilename + ".json")
  );
}

export async function simulateTransaction(
  connection: Connection,
  transaction: VersionedTransaction
) {
  const simulationResult = await connection.simulateTransaction(transaction);
  if (simulationResult.value.err) {
    simulationResult.value.logs?.forEach((x) => {
      console.log(x);
    });
  }
  console.log("Compute units: ", simulationResult.value.unitsConsumed);
  assert.equal(simulationResult.value.err, undefined);
}

export const solautoPlugin = (): UmiPlugin => ({
  install(umi) {
    umi.programs.add(createSolautoProgram(), false);
  },
});
