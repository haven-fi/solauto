import { Keypair, PublicKey } from "@solana/web3.js";
import { createSignerFromKeypair } from "@metaplex-foundation/umi";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import {
  consoleLog,
  getClient,
  getSolanaRpcConnection,
  LendingPlatform,
  LOCAL_IRONFORGE_API_URL,
  PriorityFeeSetting,
  ProgramEnv,
  rebalance,
  SOLAUTO_PROD_PROGRAM,
  SOLAUTO_TEST_PROGRAM,
  TransactionsManager,
} from "../src";
import { getSecretKey } from "./shared";

const payForTransaction = false;
const testProgram = true;
const lpEnv: ProgramEnv = "Prod";

export async function main() {
  let [, umi] = getSolanaRpcConnection(
    LOCAL_IRONFORGE_API_URL,
    testProgram ? SOLAUTO_TEST_PROGRAM : SOLAUTO_PROD_PROGRAM,
    lpEnv
  );

  const signer = createSignerFromKeypair(
    umi,
    fromWeb3JsKeypair(Keypair.fromSecretKey(getSecretKey("solauto-manager")))
  );

  const client = getClient(LendingPlatform.Marginfi, {
    signer,
    showLogs: true,
    rpcUrl: LOCAL_IRONFORGE_API_URL,
    programId: testProgram ? SOLAUTO_TEST_PROGRAM : SOLAUTO_PROD_PROGRAM,
    lpEnv,
  });

  await client.initialize({
    positionId: 1,
    authority: new PublicKey("5UqsR2PGzbP8pGPbXEeXx86Gjz2N2UFBAuFZUSVydAEe"),
    // lpUserAccount: new PublicKey(
    //   "GEokw9jqbh6d1xUNA3qaeYFFetbSR5Y1nt7C3chwwgSz"
    // ),
  });

  const transactionItems = [rebalance(client)];

  const txManager = new TransactionsManager(
    client,
    undefined,
    payForTransaction ? "normal" : "only-simulate",
    PriorityFeeSetting.Min,
    true,
    undefined,
    { totalRetries: 5 }
  );
  const statuses = await txManager.clientSend(transactionItems);

  consoleLog(statuses);
}

main();
