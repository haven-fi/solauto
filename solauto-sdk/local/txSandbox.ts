import { Keypair, PublicKey } from "@solana/web3.js";
import { createSignerFromKeypair } from "@metaplex-foundation/umi";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import {
  consoleLog,
  fetchTokenPrices,
  getClient,
  getSolanaRpcConnection,
  LendingPlatform,
  LOCAL_IRONFORGE_API_URL,
  PriorityFeeSetting,
  rebalance,
  SOLAUTO_PROD_PROGRAM,
  SOLAUTO_TEST_PROGRAM,
  TransactionsManager,
} from "../src";
import { getSecretKey } from "./shared";
import { NATIVE_MINT } from "@solana/spl-token";

const payForTransaction = false;
const testProgram = true;

export async function main() {
  const [, umi] = getSolanaRpcConnection(
    LOCAL_IRONFORGE_API_URL,
    testProgram ? SOLAUTO_TEST_PROGRAM : SOLAUTO_PROD_PROGRAM
  );

  const signer = createSignerFromKeypair(
    umi,
    fromWeb3JsKeypair(Keypair.fromSecretKey(getSecretKey("solauto-manager")))
  );

  await fetchTokenPrices([NATIVE_MINT]);

  // const client = getClient(LendingPlatform.Marginfi, {
  //   signer,
  //   showLogs: true,
  //   rpcUrl: LOCAL_IRONFORGE_API_URL,
  //   programId: testProgram ? SOLAUTO_TEST_PROGRAM : SOLAUTO_PROD_PROGRAM,
  // });

  // await client.initialize({
  //   positionId: 3,
  //   authority: new PublicKey("5UqsR2PGzbP8pGPbXEeXx86Gjz2N2UFBAuFZUSVydAEe"),
  // });

  // const transactionItems = [rebalance(client)];

  // const txManager = new TransactionsManager(
  //   client,
  //   undefined,
  //   payForTransaction ? "normal" : "only-simulate",
  //   PriorityFeeSetting.Min,
  //   true,
  //   undefined,
  //   { totalRetries: 5 }
  // );
  // const statuses = await txManager.clientSend(transactionItems);

  // consoleLog(statuses);
}

main();
