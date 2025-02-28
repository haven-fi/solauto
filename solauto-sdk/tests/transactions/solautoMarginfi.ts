import { describe, it } from "mocha";
import { none, publicKey, some } from "@metaplex-foundation/umi";
import { setupTest } from "../shared";
import { SolautoMarginfiClient } from "../../src/clients/solautoMarginfiClient";
import {
  safeFetchSolautoPosition,
  solautoAction,
  SolautoSettingsParametersInpArgs,
} from "../../src/generated";
import { buildSolautoRebalanceTransaction } from "../../src/transactions/transactionUtils";
import {
  bytesToI80F48,
  getLiqUtilzationRateBps,
  getMaxLiqUtilizationRateBps,
  maxBoostToBps,
  maxRepayFromBps,
  maxRepayToBps,
  toBaseUnit,
} from "../../src/utils/numberUtils";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  TransactionItem,
  TransactionsManager,
} from "../../src/transactions/transactionsManager";
import { PublicKey } from "@solana/web3.js";
import {
  DEFAULT_MARGINFI_GROUP,
  MARGINFI_ACCOUNTS,
  SOLAUTO_PROD_PROGRAM,
  SOLAUTO_TEST_PROGRAM,
  USDC,
  USDT,
} from "../../src/constants";
import {
  buildHeliusApiUrl,
  getMarginfiAccountPositionState,
  getSolautoManagedPositions,
  retryWithExponentialBackoff,
} from "../../src/utils";
import { PriorityFeeSetting } from "../../src/types";
import { buildIronforgeApiUrl, fetchSolautoPosition, fetchTokenPrices } from "../../dist";
import { safeFetchBank } from "../../src/marginfi-sdk";

export function getFlooredTimestampByMinute(
  unixSeconds: number,
  intervalInMinutes: number = 1
): number {
  const unixTime = Math.floor(new Date(unixSeconds * 1000).getTime() / 1000);
  const interval = intervalInMinutes * 60;
  return Math.floor(unixTime / interval) * interval;
}

describe("Solauto Marginfi tests", async () => {
  // const signer = setupTest();
  const signer = setupTest("solauto-manager");

  const payForTransactions = true;
  const testProgram = false;
  const positionId = 2;

  it("open - deposit - borrow - rebalance to 0 - withdraw - close", async () => {
    const client = new SolautoMarginfiClient(
      buildIronforgeApiUrl(process.env.IRONFORGE_API_KEY!),
      true,
      testProgram ? SOLAUTO_TEST_PROGRAM : SOLAUTO_PROD_PROGRAM
    );

    const supply = NATIVE_MINT;
    const supplyDecimals = 6;
    const debtDecimals = 6;

    await client.initialize({
      signer,
      positionId,
      authority: new PublicKey("7yk7HcAJfwNao3NSbYiPNtJvCPTxsgkzuJmyMLyP297E"),
      // new: true,
      // marginfiAccount: new PublicKey(
      //   ""
      // ),
      // marginfiGroup: new PublicKey(""),
      // supplyMint: new PublicKey(""),
      // debtMint: new PublicKey(USDC),
    });

    // console.log(await client.getFreshPositionStat\e());

    // const debtBank = await safeFetchBank(
    //   client.umi,
    //   publicKey(MARGINFI_ACCOUNTS[DEFAULT_MARGINFI_GROUP][USDC].bank)
    // );
    // const state = await getMarginfiAccountPositionState(client.umi, {
    //   pk: new PublicKey("85YaXXB1uyDMLYf4ob6jfV1kr29muVNm7mpmM8qjbVq6"),
    // });
    // console.log(state);
    // console.log(maxBoostToBps(state.maxLtvBps, state.liqThresholdBps));
    // console.log(
    //   getMaxLiqUtilizationRateBps(state.maxLtvBps, state.liqThresholdBps, 0)
    // );
    // console.log(getLiqUtilzationRateBps(18.78, 7.47, state.liqThresholdBps));
    // return;

    const transactionItems: TransactionItem[] = [];
    // const settingParams: SolautoSettingsParametersInpArgs = {
    //   boostToBps: maxBoostToBps(
    //     client.solautoPositionState?.maxLtvBps ?? 0,
    //     client.solautoPositionState?.liqThresholdBps ?? 0
    //   ),
    //   boostGap: 50,
    //   repayToBps: maxRepayToBps(
    //     client.solautoPositionState?.maxLtvBps ?? 0,
    //     client.solautoPositionState?.liqThresholdBps ?? 0
    //   ),
    //   repayGap: 50,
    //   automation: none(),
    //   targetBoostToBps: none(),
    // };

    const settingParams: SolautoSettingsParametersInpArgs = {
      boostToBps: client.solautoPositionSettings().boostToBps - 150,
      boostGap: 50,
      repayToBps: client.solautoPositionSettings().repayToBps - 150,
      repayGap: 50,
      automation: none(),
      targetBoostToBps: none(),
    };

    // if (client.solautoPositionData === null) {
    //   transactionItems.push(
    //     new TransactionItem(async () => {
    //       return {
    //         tx: client.openPosition(settingParams),
    //       };
    //     }, "open position")
    //   );

    // const initialSupplyUsd = 150;
    // transactionItems.push(
    //   new TransactionItem(async () => {
    //     // const [supplyPrice] = await fetchTokenPrices([supply]);
    //     return {
    //       tx: client.protocolInteraction(
    //         solautoAction("Deposit", [toBaseUnit(300, supplyDecimals)])
    //       ),
    //     };
    //   }, "deposit")
    // );
    // }

    // const maxLtvBps = client.solautoPositionState!.maxLtvBps;
    // const liqThresholdBps = client.solautoPositionState!.liqThresholdBps;
    // const maxRepayFrom = maxRepayFromBps(maxLtvBps, liqThresholdBps);
    // const maxRepayTo = maxRepayToBps(maxLtvBps, liqThresholdBps);
    // const maxBoostTo = maxBoostToBps(maxLtvBps, liqThresholdBps);
    // transactionItems.push(
    //   new TransactionItem(
    //     async () => ({
    //       tx: client.updatePositionIx({
    //         positionId: client.positionId,
    //         settingParams: some({
    //           ...settingParams,
    //         }),
    //         dca: null,
    //       }),
    //     }),
    //     "update position"
    //   )
    // );

    transactionItems.push(
      new TransactionItem(
        async (attemptNum) =>
          await buildSolautoRebalanceTransaction(client, undefined, attemptNum),
        "rebalance"
      )
    );

    // transactionItems.push(
    //   new TransactionItem(
    //     async () => ({ tx: client.refresh() }),
    //     "refresh"
    //   )
    // );

    // transactionItems.push(
    //   new TransactionItem(
    //     async (attemptNum) =>
    //       await buildSolautoRebalanceTransaction(client, settingParams.boostToBps, attemptNum),
    //     "rebalance"
    //   )
    // );

    // transactionItems.push(
    //   new TransactionItem(
    //     async () => ({
    //       tx: client.protocolInteraction(
    //         solautoAction("Withdraw", [{ __kind: "All" }])
    //       ),
    //     }),
    //     "withdraw"
    //   )
    // );

    // transactionItems.push(
    //   new TransactionItem(
    //     async () => ({
    //       tx: client.closePositionIx(),
    //     }),
    //     "close position"
    //   )
    // );

    const statuses = await new TransactionsManager(
      client,
      undefined,
      !payForTransactions ? "only-simulate" : "normal",
      PriorityFeeSetting.Min,
      true
    ).clientSend(transactionItems);

    console.log(statuses);
  });
});
