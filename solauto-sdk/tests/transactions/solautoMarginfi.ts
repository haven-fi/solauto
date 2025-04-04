import { describe, it } from "mocha";
import { setupTest } from "../shared";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  TransactionItem,
  TransactionsManager,
} from "../../src/services/transactions/transactionsManager";
import {
  SOLAUTO_PROD_PROGRAM,
  SOLAUTO_TEST_PROGRAM,
  USDC,
} from "../../src/constants";
import {
  buildIronforgeApiUrl,
  fetchTokenPrices,
  getClient,
  maxBoostToBps,
  maxRepayToBps,
  toBaseUnit,
} from "../../src/utils";
import { PublicKey } from "@solana/web3.js";
import {
  LendingPlatform,
  PriorityFeeSetting,
  RebalanceTxBuilder,
  solautoAction,
  SolautoSettingsParametersInpArgs,
} from "../../src";
import { tokenInfo } from "../../dist";

describe("Solauto Marginfi tests", async () => {
  const signer = setupTest();

  const testProgram = true;
  const positionId = 1;

  it("open - deposit - borrow - rebalance to 0 - withdraw - close", async () => {
    const client = getClient(LendingPlatform.Marginfi, {
      signer,
      rpcUrl: buildIronforgeApiUrl(process.env.IRONFORGE_API_KEY!),
      showLogs: true,
      programId: testProgram ? SOLAUTO_TEST_PROGRAM : SOLAUTO_PROD_PROGRAM,
    });

    const supplyMint = new PublicKey(NATIVE_MINT);
    const debtMint = new PublicKey(USDC);

    await client.initialize({
      positionId,
      new: true,
      supplyMint,
      debtMint,
    });

    const transactionItems: TransactionItem[] = [];
    const settings: SolautoSettingsParametersInpArgs = {
      boostToBps:
        maxBoostToBps(
          client.solautoPosition.state().maxLtvBps ?? 0,
          client.solautoPosition.state().liqThresholdBps ?? 0
        ) - 200,
      boostGap: 50,
      repayToBps: maxRepayToBps(
        client.solautoPosition.state().maxLtvBps ?? 0,
        client.solautoPosition.state().liqThresholdBps ?? 0
      ),
      repayGap: 50,
    };

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
              toBaseUnit(
                supplyUsd / supplyPrice,
                tokenInfo(supplyMint).decimals
              ),
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

    const statuses = await new TransactionsManager(
      client,
      undefined,
      "only-simulate",
      PriorityFeeSetting.Min,
      true,
      undefined,
      { totalRetries: 5 }
    ).clientSend(transactionItems);

    console.log(statuses);
  });
});
