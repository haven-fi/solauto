import { Keypair, PublicKey } from "@solana/web3.js";
import { createSignerFromKeypair } from "@metaplex-foundation/umi";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import {
  consoleLog,
  fetchBankAddresses,
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
const testProgram = true;

export async function main() {
  const [conn, umi] = getSolanaRpcConnection(
    LOCAL_IRONFORGE_API_URL,
    testProgram ? SOLAUTO_TEST_PROGRAM : SOLAUTO_PROD_PROGRAM
  );

  console.log(
    await fetchBankAddresses(
      conn,
      umi,
      new PublicKey("CCKtUs6Cgwo4aaQUmBPmyoApH2gUDErxNZCAntD6LYGh")
    )
  ); // sol
  console.log(
    await fetchBankAddresses(
      conn,
      umi,
      new PublicKey("Bohoc1ikHLD7xKJuzTyiTyCwzaL5N7ggJQu75A8mKYM8")
    )
  ); // jito sol
  console.log(
    await fetchBankAddresses(
      conn,
      umi,
      new PublicKey("Guu5uBc8k1WK1U2ihGosNaCy57LSgCkpWAabtzQqrQf8")
    )
  ); // jup
  console.log(
    await fetchBankAddresses(
      conn,
      umi,
      new PublicKey("Amtw3n7GZe5SWmyhMhaFhDTi39zbTkLeWErBsmZXwpDa")
    )
  ); // jlp
  console.log(
    await fetchBankAddresses(
      conn,
      umi,
      new PublicKey("845oEvt1oduoBj5zQxTr21cWWaUVnRjGerJuW3yMo2nn")
    )
  ); // popcat

  // const signer = createSignerFromKeypair(
  //   umi,
  //   fromWeb3JsKeypair(Keypair.fromSecretKey(getSecretKey("solauto-manager")))
  // );

  // const client = getClient(LendingPlatform.Marginfi, {
  //   signer,
  //   showLogs: true,
  //   rpcUrl: LOCAL_IRONFORGE_API_URL,
  //   programId: testProgram ? SOLAUTO_TEST_PROGRAM : SOLAUTO_PROD_PROGRAM,
  // });

  // await client.initialize({
  //   positionId: 5,
  //   authority: new PublicKey("5UqsR2PGzbP8pGPbXEeXx86Gjz2N2UFBAuFZUSVydAEe"),
  // });

  // const transactionItems: TransactionItem[] = [];

  // transactionItems.push(
  //   new TransactionItem(
  //     async (attemptNum) =>
  //       await new RebalanceTxBuilder(client).buildRebalanceTx(attemptNum),
  //     "rebalance"
  //   )
  // );

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
