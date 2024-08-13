import { Signer, createSignerFromKeypair } from "@metaplex-foundation/umi";
import { Connection, clusterApiUrl } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { getSecretKey } from "../local/shared";

export function setupTest(keypairFilename?: string): Signer {
  const umi = createUmi(
    new Connection(clusterApiUrl("mainnet-beta"), "confirmed")
  );
  const secretKey = getSecretKey(keypairFilename);
  const signerKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  const signer = createSignerFromKeypair(umi, signerKeypair);

  return signer;
}
