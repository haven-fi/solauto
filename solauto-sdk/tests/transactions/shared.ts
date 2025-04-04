import { Signer } from "@metaplex-foundation/umi";
import {
  buildIronforgeApiUrl,
  consoleLog,
  fetchTokenPrices,
  getClient,
  LendingPlatform,
  maxBoostToBps,
  maxRepayFromBps,
  RebalanceTxBuilder,
  SOLAUTO_PROD_PROGRAM,
  SOLAUTO_TEST_PROGRAM,
  solautoAction,
  SolautoSettingsParametersInpArgs,
  toBaseUnit,
  tokenInfo,
  TransactionItem,
  TransactionsManager,
  USDC,
} from "../../src";
import { PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";

export async function e2eTransactionTest(
  signer: Signer,
  testProgram: boolean,
  lendingPlatform: LendingPlatform
) {
  const client = getClient(lendingPlatform, {
    signer,
    rpcUrl: buildIronforgeApiUrl(process.env.IRONFORGE_API_KEY!),
    showLogs: true,
    programId: testProgram ? SOLAUTO_TEST_PROGRAM : SOLAUTO_PROD_PROGRAM,
  });

  const supplyMint = new PublicKey(NATIVE_MINT);
  const debtMint = new PublicKey(USDC);

  await client.initialize({
    positionId: 1,
    new: true,
    supplyMint,
    debtMint,
  });

  const [maxLtvBps, liqThresholdBps] =
    await client.solautoPosition.maxLtvAndLiqThresholdBps();
  const settings: SolautoSettingsParametersInpArgs = {
    boostToBps: maxBoostToBps(maxLtvBps, liqThresholdBps) - 200,
    boostGap: 50,
    repayToBps: maxRepayFromBps(maxLtvBps, liqThresholdBps),
    repayGap: 50,
  };

  const transactionItems: TransactionItem[] = [];

  transactionItems.push(
    new TransactionItem(async () => {
      return {
        tx: client.openPosition(settings),
      };
    }, "open position")
  );

  const [supplyPrice, debtPrice] = await fetchTokenPrices([
    supplyMint,
    debtMint,
  ]);

  const supplyUsd = 100;
  transactionItems.push(
    new TransactionItem(async () => {
      return {
        tx: client.protocolInteraction(
          solautoAction("Deposit", [
            toBaseUnit(supplyUsd / supplyPrice, tokenInfo(supplyMint).decimals),
          ])
        ),
      };
    }, "deposit")
  );

  const debtUsd = 20;
  transactionItems.push(
    new TransactionItem(async () => {
      return {
        tx: client.protocolInteraction(
          solautoAction("Borrow", [
            toBaseUnit(debtUsd / debtPrice, tokenInfo(debtMint).decimals),
          ])
        ),
      };
    }, "borrow")
  );

  transactionItems.push(
    new TransactionItem(async (attemptNum) => {
      const rebalancer = new RebalanceTxBuilder(client, 0);
      return await rebalancer.buildRebalanceTx(attemptNum);
    }, "rebalance")
  );

  transactionItems.push(
    new TransactionItem(
      async () => ({
        tx: client.protocolInteraction(
          solautoAction("Withdraw", [{ __kind: "All" }])
        ),
      }),
      "withdraw"
    )
  );

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
    "only-simulate",
    undefined,
    true
  );
  const statuses = await txManager.clientSend(transactionItems);

  consoleLog(statuses);
}
