import { describe, it } from "mocha";
import { none, some } from "@metaplex-foundation/umi";
import { setupTest } from "../shared";
import {
  SolautoMarginfiClient,
} from "../../src/clients/solautoMarginfiClient";
import {
  solautoAction,
  SolautoSettingsParametersInpArgs,
} from "../../src/generated";
import { buildSolautoRebalanceTransaction } from "../../src/transactions/transactionUtils";
import { maxBoostToBps, maxRepayFromBps, maxRepayToBps, toBaseUnit } from "../../src/utils/numberUtils";
import { NATIVE_MINT } from "@solana/spl-token";
import { getTokenPrices } from "../../src/utils/generalUtils";
import {
  TransactionItem,
  TransactionsManager,
} from "../../src/transactions/transactionsManager";
import { PublicKey } from "@solana/web3.js";
import { USDC_MINT } from "../../src/constants";

describe("Solauto Marginfi tests", async () => {
  // const signer = setupTest();
  const signer = setupTest("solauto-manager");

  const payForTransactions = false;
  const useJitoBundle = false;
  const positionId = 2;

  it("open - deposit - borrow - rebalance to 0 - withdraw - close", async () => {
    const client = new SolautoMarginfiClient(process.env.HELIUS_API_KEY!, true);

    const supply = NATIVE_MINT;
    const supplyDecimals = 9;
    const debtDecimals = 6;

    await client.initialize(
      {
        signer,
        positionId,
        authority: new PublicKey("AprYCPiVeKMCgjQ2ZufwChMzvQ5kFjJo2ekTLSkXsQDm")
        // marginfiAccount: new PublicKey(
        //   "4nNvUXF5YqHFcH2nGweSiuvy1ct7V5FXfoCLKFYUN36z"
        // ),
        // supplyMint: NATIVE_MINT,
        // debtMint: new PublicKey(USDC_MINT),
      }
    );

    const transactionItems: TransactionItem[] = [];
    const settingParams: SolautoSettingsParametersInpArgs = {
      boostToBps: 4000,
      boostGap: 500,
      repayToBps: 7456,
      repayGap: 500,
      automation: none(),
      targetBoostToBps: none(),
    };

    // if (client.solautoPositionData === null) {
    //   transactionItems.push(
    //     new TransactionItem(async () => {
    //       return {
    //         tx: client.openPosition(),
    //       };
    //     }, "open position")
    //   );

      // const initialSupplyUsd = 150;
      // transactionItems.push(
      //   new TransactionItem(async () => {
      //     const [supplyPrice] = await getTokenPrices([supply]);
      //     return {
      //       tx: client.protocolInteraction(
      //         solautoAction("Deposit", [
      //           toBaseUnit(initialSupplyUsd / supplyPrice, supplyDecimals),
      //         ])
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
    //           boostToBps: maxBoostTo,
    //           boostGap: 50,
    //           repayToBps: maxRepayTo,
    //           repayGap: maxRepayFrom - maxRepayTo
    //         }),
    //         dca: null,
    //       }),
    //     }),
    //     "update position"
    //   )
    // );

    // const initialSupplyUsd = 50;
    // transactionItems.push(
    //   new TransactionItem(async () => {
    //     const [supplyPrice] = await getTokenPrices([supply]);
    //     return {
    //       tx: client.protocolInteraction(
    //         solautoAction("Deposit", [
    //           toBaseUnit(initialSupplyUsd / supplyPrice, supplyDecimals),
    //         ])
    //       ),
    //     };
    //   }, "deposit")
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
    //     async (attemptNum) => await buildSolautoRebalanceTransaction(client, 0),
    //     "repay all debt"
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

    await new TransactionsManager(
      client,
      transactionItems,
      undefined,
      !payForTransactions,
      useJitoBundle
    ).send();
  });
});
