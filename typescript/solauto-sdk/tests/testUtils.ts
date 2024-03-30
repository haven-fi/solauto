import { Keypair } from "@solana/web3.js";
import fs from "fs";
import path from "path";

export function loadSecretKey(keypairPath: string) {
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
  return new Uint8Array(secretKey);
}

export function getSecretKey(keypairFilename: string = "id"): Uint8Array {
  return loadSecretKey(
    path.join(process.env.HOME!, ".config", "solana", keypairFilename + ".json")
  );
}

export function generateRandomU8(): number {
  return Math.floor(Math.random() * 256);
}
