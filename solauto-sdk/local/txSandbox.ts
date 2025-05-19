import { Keypair, PublicKey } from "@solana/web3.js";
import { createSignerFromKeypair, publicKey } from "@metaplex-foundation/umi";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import {
  bytesToI80F48,
  ClientTransactionsManager,
  consoleLog,
  fetchBank,
  fetchMarginfiAccount,
  getBatches,
  getClient,
  getPositionExBulk,
  getSolanaRpcConnection,
  getSolautoManagedPositions,
  LendingPlatform,
  lendingPoolAccrueBankInterest,
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
import { fromBaseUnit } from "../dist";

const payForTransaction = true;
const testProgram = false;
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
    positionId: 1,
    authority: new PublicKey("5UqsR2PGzbP8pGPbXEeXx86Gjz2N2UFBAuFZUSVydAEe"),
    // lpUserAccount: new PublicKey(
    //   "GEokw9jqbh6d1xUNA3qaeYFFetbSR5Y1nt7C3chwwgSz"
    // ),
  });

  const transactionItems = [
    new TransactionItem(async () => ({
      tx: lendingPoolAccrueBankInterest(umi, {
        marginfiGroup: publicKey(
          "DQ2jqDJw9uzTwttf6h6r217BQ7kws3jZbJXDkfbCJa1q"
        ),
        bank: publicKey("EXrnNVfLagt3j4hCHSD9WqK75o6dkZBtjpnrSrSC78MA"),
      }),
    })),
  ];

  const txManager = new ClientTransactionsManager({
    txHandler: client,
    txRunType: payForTransaction ? "normal" : "only-simulate",
    priorityFeeSetting: PriorityFeeSetting.Default,
    retryConfig: { totalRetries: 2 },
  });
  const statuses = await txManager.send(transactionItems);
  consoleLog(statuses);

  await new Promise((resolve) => setTimeout(resolve, 5000));

  const mfiAccount = await fetchMarginfiAccount(
    umi,
    publicKey("Fun9UD87tLCxqxoTvpGYAy6Uwk2eevFGDk1VvxpXbd5x")
  );
  const bank = await fetchBank(
    umi,
    publicKey("EXrnNVfLagt3j4hCHSD9WqK75o6dkZBtjpnrSrSC78MA"),
    { commitment: "confirmed" }
  );

  console.log(
    fromBaseUnit(
      BigInt(
        Math.round(
          bytesToI80F48(
            mfiAccount.lendingAccount.balances[0].assetShares.value
          ) * bytesToI80F48(bank.assetShareValue.value)
        )
      ),
      6
    )
  );
  // 1:34pm - $4479.61
  // 2:51pm - $4513.30
  // 12:58pm - $4529.16
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
      retryConfig: { totalRetries: 2 },
    });
    const statuses = await txManager.send(batch);
    consoleLog(statuses);
  }
}

main();
// refreshAll();
