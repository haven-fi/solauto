import { Keypair, PublicKey } from "@solana/web3.js";
import { createSignerFromKeypair } from "@metaplex-foundation/umi";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import {
  ClientTransactionsManager,
  consoleLog,
  getBatches,
  getClient,
  getPositionExBulk,
  getSolanaRpcConnection,
  getSolautoManagedPositions,
  LendingPlatform,
  LOCAL_IRONFORGE_API_URL,
  PriceType,
  PriorityFeeSetting,
  ProgramEnv,
  rebalance,
  SOLAUTO_PROD_PROGRAM,
  SOLAUTO_TEST_PROGRAM,
  SolautoClient,
  TransactionItem,
} from "../src";
import { getSecretKey } from "./shared";

const payForTransaction = false;
const testProgram = true;
const lpEnv: ProgramEnv = "Prod";

let [, umi] = getSolanaRpcConnection(
  LOCAL_IRONFORGE_API_URL,
  testProgram ? SOLAUTO_TEST_PROGRAM : SOLAUTO_PROD_PROGRAM,
  lpEnv
);

const signer = createSignerFromKeypair(
  umi,
  fromWeb3JsKeypair(Keypair.fromSecretKey(getSecretKey("solauto-manager")))
);

export async function main() {
  const client = getClient(LendingPlatform.Marginfi, {
    signer,
    showLogs: true,
    rpcUrl: LOCAL_IRONFORGE_API_URL,
    programId: testProgram ? SOLAUTO_TEST_PROGRAM : SOLAUTO_PROD_PROGRAM,
    lpEnv,
  });

  await client.initializeExistingSolautoPosition({
    positionId: 2,
    authority: new PublicKey("rC5dMP5dmSsfQ66rynzfFzuc122Eex9h1RJHVDkeH6D"),
    // lpUserAccount: new PublicKey(
    //   "GEokw9jqbh6d1xUNA3qaeYFFetbSR5Y1nt7C3chwwgSz"
    // ),
  });

  const transactionItems = [rebalance(client)];

  const txManager = new ClientTransactionsManager({
    txHandler: client,
    txRunType: payForTransaction ? "normal" : "only-simulate",
    priorityFeeSetting: PriorityFeeSetting.Default,
    retryConfig: { totalRetries: 5 },
  });
  const statuses = await txManager.send(transactionItems);
  consoleLog(statuses);
}

async function refreshAll() {
  const allPositions = await getSolautoManagedPositions(umi);
  const positions = await getPositionExBulk(
    umi,
    allPositions.map((x) => new PublicKey(x.publicKey!))
  );

  let client: SolautoClient | undefined;
  const transactionItems: TransactionItem[] = [];
  for (const pos of positions) {
    client = getClient(pos.lendingPlatform, {
      signer,
      showLogs: true,
      rpcUrl: LOCAL_IRONFORGE_API_URL,
      programId: testProgram ? SOLAUTO_TEST_PROGRAM : SOLAUTO_PROD_PROGRAM,
      lpEnv,
    });

    await client!.initialize({
      positionId: pos.positionId,
      authority: pos.authority,
    });

    const ix = client!.refreshIx(PriceType.Realtime);
    transactionItems.push(
      new TransactionItem(
        async () => ({ tx: ix }),
        `refresh ${pos.authority} (${pos.positionId})`
      )
    );
  }

  const txBatches = getBatches(transactionItems, 15);

  for (const batch of txBatches) {
    const txManager = new ClientTransactionsManager({
      txHandler: client!,
      txRunType: payForTransaction ? "normal" : "only-simulate",
      priorityFeeSetting: PriorityFeeSetting.Default,
      retryConfig: { totalRetries: 5 },
    });
    const statuses = await txManager.send(batch);
    consoleLog(statuses);
  }
}

main();
// refreshAll();
