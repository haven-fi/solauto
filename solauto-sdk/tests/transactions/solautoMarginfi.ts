import { describe, it } from "mocha";
import { setupTest } from "../shared";
import { SolautoMarginfiClient } from "../../src/services/solauto/solautoMarginfiClient";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  TransactionItem,
  TransactionsManager,
} from "../../src/services/transactions/transactionsManager";
import {
  SOLAUTO_PROD_PROGRAM,
  SOLAUTO_TEST_PROGRAM,
} from "../../src/constants";
import { buildIronforgeApiUrl } from "../../src/utils";
import { PublicKey } from "@solana/web3.js";
import { PriorityFeeSetting } from "../../src";

describe("Solauto Marginfi tests", async () => {
  const signer = setupTest();
  // const signer = setupTest("solauto-manager");

  const payForTransactions = false;
  const testProgram = true;
  const positionId = 1;

  it("open - deposit - borrow - rebalance to 0 - withdraw - close", async () => {
    const client = new SolautoMarginfiClient({
      rpcUrl: buildIronforgeApiUrl(process.env.IRONFORGE_API_KEY!),
      showLogs: true,
      programId: testProgram ? SOLAUTO_TEST_PROGRAM : SOLAUTO_PROD_PROGRAM,
    });

    const supply = NATIVE_MINT;
    const supplyDecimals = 6;
    const debtDecimals = 6;

    await client.initialize({
      signer,
      positionId,
      authority: new PublicKey("5bFfSCsGUgEzYH8kwwRtFnWkKZ1by8uD8RHvKQPnQReB"),
      // new: true,
      // marginfiAccount: new PublicKey(
      //   ""
      // ),
      // marginfiGroup: new PublicKey(""),
      // supplyMint: new PublicKey(""),
      // debtMint: new PublicKey(USDC),
    });

    // const mfiAccount = await safeFetchMarginfiAccount(
    //   client.umi,
    //   publicKey("E8oukAkTMW4YsAPymMzWQHWb8egmGq9yjDtmMi6gfY18")
    // );
    // // console.log(mfiAccount.lendingAccount.balances);
    // console.log(
    //   mfiAccount.lendingAccount.balances.map((x) =>
    //     bytesToI80F48(x.liabilityShares.value)
    //   )
    // );
    // console.log(
    //   mfiAccount.lendingAccount.balances.map((x) => x.bankPk.toString())
    // );

    const transactionItems: TransactionItem[] = [];
    // const settings: SolautoSettingsParametersInpArgs = {
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

    // const settings: SolautoSettingsParametersInpArgs = {
    //   boostToBps: client.solautoPositionSettings().boostToBps - 150,
    //   boostGap: 50,
    //   repayToBps: client.solautoPositionSettings().repayToBps - 150,
    //   repayGap: 50,
    // };

    // if (client.solautoPositionData === null) {
    //   transactionItems.push(
    //     new TransactionItem(async () => {
    //       return {
    //         tx: client.openPosition(settings),
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
    //         settings: some({
    //           ...settings,
    //         }),
    //         dca: null,
    //       }),
    //     }),
    //     "update position"
    //   )
    // );

    // transactionItems.push(
    //   new TransactionItem(
    //     async (attemptNum) =>
    //       await buildSolautoRebalanceTransaction(client, undefined, attemptNum),
    //     "rebalance"
    //   )
    // );

    // transactionItems.push(
    //   new TransactionItem(async () => ({
    //     tx: transactionBuilder().add([
    //       lendingPoolAccrueBankInterest(client.umi, {
    //         bank: publicKey("3J5rKmCi7JXG6qmiobFJyAidVTnnNAMGj4jomfBxKGRM"),
    //         marginfiGroup: publicKey(
    //           "EpzY5EYF1A5eFDRfjtsPXSYMPmEx1FXKaXPnouTMF4dm"
    //         ),
    //       }),
    //       lendingPoolAccrueBankInterest(client.umi, {
    //         bank: publicKey("6cgYhBFWCc5sNHxkvSRhd5H9AdAHR41zKwuF37HmLry5"),
    //         marginfiGroup: publicKey(
    //           "EpzY5EYF1A5eFDRfjtsPXSYMPmEx1FXKaXPnouTMF4dm"
    //         ),
    //       }),
    //     ]),
    //   }))
    // );

    // transactionItems.push(
    //   new TransactionItem(async () => ({
    //     tx: transactionBuilder().add(
    //       imfiAccount.lendingAccount.balances
    //         .filter(
    //           (x) => x.active && bytesToI80F48(x.liabilityShares.value) > 0
    //         )
    //         .map((x) =>
    //           client.closeBalance(
    //             client.intermediaryMarginfiAccountPk,
    //             toWeb3JsPublicKey(x.bankPk)
    //           )
    //         )
    //     ),
    //   }))
    // );

    // transactionItems.push(
    //   new TransactionItem(
    //     async () => ({ tx: client.refresh() }),
    //     "refresh"
    //   )
    // );

    // transactionItems.push(
    //   new TransactionItem(
    //     async (attemptNum) =>
    //       await buildSolautoRebalanceTransaction(client, 0, attemptNum),
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
      true,
      undefined,
      { totalRetries: 5 }
    ).clientSend(transactionItems);

    console.log(statuses);
  });
});
