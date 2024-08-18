import { Signer, createSignerFromKeypair } from "@metaplex-foundation/umi";
import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { getSecretKey } from "../local/shared";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";

export function setupTest(keypairFilename?: string, random?: boolean): Signer {
  const umi = createUmi(
    new Connection(clusterApiUrl("mainnet-beta"), "confirmed")
  );
  const secretKey = getSecretKey(keypairFilename);
  const signerKeypair = random
    ? fromWeb3JsKeypair(Keypair.generate())
    : umi.eddsa.createKeypairFromSecretKey(secretKey);
  const signer = createSignerFromKeypair(umi, signerKeypair);

  return signer;
}
