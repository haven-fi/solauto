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
  RebalanceTxBuilder,
  SOLAUTO_PROD_PROGRAM,
  SOLAUTO_TEST_PROGRAM,
  TransactionItem,
  TransactionsManager,
} from "../src";
import { getSecretKey } from "./shared";

const payForTransaction = false;
const testProgram = false;

export async function main() {
  const [, umi] = getSolanaRpcConnection(
    LOCAL_IRONFORGE_API_URL,
    testProgram ? SOLAUTO_TEST_PROGRAM : SOLAUTO_PROD_PROGRAM
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
  });

  await client.initialize({
    positionId: 1,
    authority: new PublicKey("7ZN1w3ZE51FTXxdDjPPNpdZHuXWRvDK2h6osTHNXfsuL"),
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
