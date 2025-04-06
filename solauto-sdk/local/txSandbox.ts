import { Keypair } from "@solana/web3.js";
import {
  buildIronforgeApiUrl,
  consoleLog,
  getClient,
  getSolanaRpcConnection,
  LendingPlatform,
  SOLAUTO_PROD_PROGRAM,
  SOLAUTO_TEST_PROGRAM,
  TransactionItem,
  TransactionsManager,
} from "../src";
import { getSecretKey } from "./shared";
import { createSignerFromKeypair } from "@metaplex-foundation/umi";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";

const payForTransaction = false;
const testProgram = true;

export async function main() {
  const [, umi] = getSolanaRpcConnection(
    buildIronforgeApiUrl(process.env.IRONFORGE_API_KEY!),
    testProgram ? SOLAUTO_TEST_PROGRAM : SOLAUTO_PROD_PROGRAM
  );

  const signer = createSignerFromKeypair(
    umi,
    fromWeb3JsKeypair(Keypair.fromSecretKey(getSecretKey()))
  );

  const client = getClient(LendingPlatform.Marginfi, {
    signer,
    showLogs: true,
    rpcUrl: buildIronforgeApiUrl(process.env.IRONFORGE_API_KEY!),
    programId: testProgram ? SOLAUTO_TEST_PROGRAM : SOLAUTO_PROD_PROGRAM,
  });

  await client.initialize({
    positionId: 1,
  });

  const transactionItems: TransactionItem[] = [];

  transactionItems.push(
    new TransactionItem(
      async () => ({
        tx: client.closePositionIx(),
      }),
      "close position"
    )
  );

  const txManager = new TransactionsManager(
    client,
    undefined,
    payForTransaction ? "normal" : "only-simulate",
    undefined,
    true,
    undefined,
    { totalRetries: 5 }
  );
  const statuses = await txManager.clientSend(transactionItems);

  consoleLog(statuses);
}

main();
