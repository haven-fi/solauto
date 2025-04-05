import { Keypair } from "@solana/web3.js";
import {
  buildIronforgeApiUrl,
  getSolanaRpcConnection,
  SOLAUTO_PROD_PROGRAM,
  SOLAUTO_TEST_PROGRAM,
} from "../src";
import { getSecretKey } from "./shared";
import { createSignerFromKeypair } from "@metaplex-foundation/umi";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";

const testProgram = true;

export async function main() {
  const [conn, umi] = getSolanaRpcConnection(
    buildIronforgeApiUrl(process.env.IRONFORGE_API_KEY!),
    testProgram ? SOLAUTO_TEST_PROGRAM : SOLAUTO_PROD_PROGRAM
  );
  const signer = createSignerFromKeypair(
    umi,
    fromWeb3JsKeypair(Keypair.fromSecretKey(getSecretKey()))
  );


}

main();
