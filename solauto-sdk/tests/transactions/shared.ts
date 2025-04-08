import { PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { Signer } from "@metaplex-foundation/umi";
import {
  consoleLog,
  fetchTokenPrices,
  getClient,
  LendingPlatform,
  LOCAL_IRONFORGE_API_URL,
  maxBoostToBps,
  maxRepayToBps,
  RebalanceTxBuilder,
  SOLAUTO_PROD_PROGRAM,
  SOLAUTO_TEST_PROGRAM,
  solautoAction,
  SolautoSettingsParametersInpArgs,
  toBaseUnit,
  TransactionItem,
  TransactionsManager,
  USDC,
} from "../../src";

export async function e2eTransactionTest(
  signer: Signer,
  testProgram: boolean,
  lendingPlatform: LendingPlatform,
  withFlashLoan: boolean
) {
  const client = getClient(lendingPlatform, {
    signer,
    rpcUrl: LOCAL_IRONFORGE_API_URL,
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
    await client.pos.maxLtvAndLiqThresholdBps();
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
            toBaseUnit(
              supplyUsd / supplyPrice,
              client.pos.supplyMintInfo().decimals
            ),
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
            toBaseUnit(debtUsd / debtPrice, client.pos.debtMintInfo().decimals),
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

  const txManager = new TransactionsManager(client, undefined, "only-simulate");
  const statuses = await txManager.clientSend(transactionItems);

  consoleLog(statuses);
}
