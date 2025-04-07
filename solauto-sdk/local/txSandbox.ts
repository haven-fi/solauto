import { Keypair, PublicKey } from "@solana/web3.js";
import {
  buildIronforgeApiUrl,
  consoleLog,
  getClient,
  getSolanaRpcConnection,
  LendingPlatform,
  PriorityFeeSetting,
  RebalanceTxBuilder,
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
    fromWeb3JsKeypair(Keypair.fromSecretKey(getSecretKey("solauto-manager")))
  );

  const client = getClient(LendingPlatform.Marginfi, {
    signer,
    showLogs: true,
    rpcUrl: buildIronforgeApiUrl(process.env.IRONFORGE_API_KEY!),
    programId: testProgram ? SOLAUTO_TEST_PROGRAM : SOLAUTO_PROD_PROGRAM,
  });

  await client.initialize({
    positionId: 5,
    authority: new PublicKey("5UqsR2PGzbP8pGPbXEeXx86Gjz2N2UFBAuFZUSVydAEe"),
  });

  const transactionItems: TransactionItem[] = [];

  transactionItems.push(
    new TransactionItem(
      async (attemptNum) =>
        await new RebalanceTxBuilder(client).buildRebalanceTx(attemptNum),
      "rebalance"
    )
  );

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
