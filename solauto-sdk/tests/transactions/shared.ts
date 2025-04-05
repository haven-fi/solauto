import { Signer } from "@metaplex-foundation/umi";
import {
  buildIronforgeApiUrl,
  consoleLog,
  fetchTokenPrices,
  getClient,
  LendingPlatform,
  maxBoostToBps,
  maxRepayToBps,
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
  lendingPlatform: LendingPlatform,
  withFlashLoan: boolean
) {
  const client = getClient(lendingPlatform, {
    signer,
    rpcUrl: buildIronforgeApiUrl(process.env.IRONFORGE_API_KEY!),
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
    repayToBps: maxRepayToBps(maxLtvBps, liqThresholdBps),
    repayGap: 50,
  };

  const transactionItems: TransactionItem[] = [];

  transactionItems.push(
    new TransactionItem(async () => {
      return {
        tx: client.openPositionIx(settings),
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
        tx: client.protocolInteractionIx(
          solautoAction("Deposit", [
            toBaseUnit(supplyUsd / supplyPrice, tokenInfo(supplyMint).decimals),
          ])
        ),
      };
    }, "deposit")
  );

  const debtUsd = withFlashLoan ? 60 : 10;
  transactionItems.push(
    new TransactionItem(async () => {
      return {
        tx: client.protocolInteractionIx(
          solautoAction("Borrow", [
            toBaseUnit(debtUsd / debtPrice, tokenInfo(debtMint).decimals),
          ])
        ),
      };
    }, "borrow")
  );

  transactionItems.push(
    new TransactionItem(
      async (attemptNum) =>
        await new RebalanceTxBuilder(client, 0).buildRebalanceTx(attemptNum),
      "rebalance"
    )
  );

  transactionItems.push(
    new TransactionItem(
      async () => ({
        tx: client.protocolInteractionIx(
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
    true,
    undefined,
    { totalRetries: 5 }
  );
  const statuses = await txManager.clientSend(transactionItems);

  consoleLog(statuses);
}
