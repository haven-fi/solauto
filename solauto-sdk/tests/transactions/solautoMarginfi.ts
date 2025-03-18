import { describe, it } from "mocha";
import {
  none,
  publicKey,
  some,
  transactionBuilder,
  Umi,
  UmiError,
} from "@metaplex-foundation/umi";
import { setupTest } from "../shared";
import { SolautoMarginfiClient } from "../../src/clients/solautoMarginfiClient";
import {
  fetchSolautoPosition,
  PositionType,
  safeFetchAllSolautoPosition,
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
  POPCAT,
  RETARDIO,
  SOLAUTO_PROD_PROGRAM,
  SOLAUTO_TEST_PROGRAM,
  USDC,
  USDT,
} from "../../src/constants";
import {
  buildHeliusApiUrl,
  fetchTokenPrices,
  getAllPositionsByAuthority,
  getBankLiquidityAvailableBaseUnit,
  getQnComputeUnitPriceEstimate,
  getSolautoManagedPositions,
  getSolautoPositionAccount,
  marginfiAccountEmpty,
  retryWithExponentialBackoff,
  safeGetPrice,
} from "../../src/utils";
import { PriorityFeeSetting } from "../../src/types";
import {
  buildIronforgeApiUrl,
  fromBaseUnit,
  tokenInfo,
  USD_DECIMALS,
} from "../../dist";
import {
  lendingPoolAccrueBankInterest,
  safeFetchAllBank,
  safeFetchBank,
  safeFetchMarginfiAccount,
} from "../../src/marginfi-sdk";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";

async function test(
  umi: Umi,
  sp: PublicKey | undefined,
  supplyMint: PublicKey,
  sb: PublicKey,
  supplyMintDecimals: number,
  debtMint: PublicKey,
  db: PublicKey,
  debtMintDecimals: number
) {
  const solautoPosition = sp
    ? await fetchSolautoPosition(umi, publicKey(sp))
    : undefined;

  const mfiAccount = solautoPosition
    ? await safeFetchMarginfiAccount(
        umi,
        solautoPosition.position.protocolUserAccount
      )
    : undefined;

  const supplyBank = await safeFetchBank(umi, publicKey(sb));
  const debtBank = await safeFetchBank(umi, publicKey(db));

  await fetchTokenPrices([supplyMint, debtMint]);

  console.log(supplyBank);
  console.log(debtBank);

  if (mfiAccount) {
    console.log(mfiAccount.lendingAccount.balances);
    console.log(
      fromBaseUnit(
        BigInt(
          Math.round(
            bytesToI80F48(
              mfiAccount.lendingAccount.balances[0].assetShares.value
            ) * bytesToI80F48(supplyBank.assetShareValue.value)
          )
        ),
        supplyMintDecimals
      ) * safeGetPrice(supplyMint)
    );
  }

  // const imfiAccount = await safeFetchMarginfiAccount(
  //   umi,
  //   publicKey("E8oukAkTMW4YsAPymMzWQHWb8egmGq9yjDtmMi6gfY18")
  // );

  // console.log(
  //   bytesToI80F48(
  //     imfiAccount.lendingAccount.balances[0].liabilityShares.value
  //   ) * bytesToI80F48(supplyBank.liabilityShareValue.value),
  //   bytesToI80F48(imfiAccount.lendingAccount.balances[0].assetShares.value) *
  //     bytesToI80F48(supplyBank.assetShareValue.value)
  // );
  // console.log(
  //   bytesToI80F48(
  //     imfiAccount.lendingAccount.balances[1].liabilityShares.value
  //   ) * bytesToI80F48(debtBank.liabilityShareValue.value),
  //   bytesToI80F48(imfiAccount.lendingAccount.balances[1].assetShares.value) *
  //     bytesToI80F48(debtBank.assetShareValue.value)
  // );

  console.log(
    bytesToI80F48(
      supplyBank.config.interestRateConfig.protocolOriginationFee.value
    )
  );
  console.log(
    bytesToI80F48(
      debtBank.config.interestRateConfig.protocolOriginationFee.value
    )
  );

  console.log(
    bytesToI80F48(supplyBank.totalAssetShares.value),
    bytesToI80F48(supplyBank.totalLiabilityShares.value),
    bytesToI80F48(supplyBank.totalAssetShares.value) -
      bytesToI80F48(supplyBank.totalLiabilityShares.value),
    fromBaseUnit(
      getBankLiquidityAvailableBaseUnit(supplyBank, false),
      supplyMintDecimals
    ) * safeGetPrice(supplyMint)
  );
  console.log(
    bytesToI80F48(debtBank.totalAssetShares.value),
    bytesToI80F48(debtBank.totalLiabilityShares.value),
    bytesToI80F48(debtBank.totalAssetShares.value) -
      bytesToI80F48(debtBank.totalLiabilityShares.value),
    fromBaseUnit(
      getBankLiquidityAvailableBaseUnit(debtBank, false),
      debtMintDecimals
    ) * safeGetPrice(debtMint)
  );
}

describe("Solauto Marginfi tests", async () => {
  const signer = setupTest();
  // const signer = setupTest("solauto-manager");

  const payForTransactions = true;
  const testProgram = true;
  const positionId = 1;

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
      // authority: new PublicKey("5UqsR2PGzbP8pGPbXEeXx86Gjz2N2UFBAuFZUSVydAEe"),
      // new: true,
      // marginfiAccount: new PublicKey(
      //   ""
      // ),
      // marginfiGroup: new PublicKey(""),
      // supplyMint: new PublicKey(""),
      // debtMint: new PublicKey(USDC),
    });

    // await test(
    //   client.umi,
    //   // new PublicKey("E8oukAkTMW4YsAPymMzWQHWb8egmGq9yjDtmMi6gfY18"),
    //   undefined,
    //   new PublicKey(RETARDIO),
    //   new PublicKey("3J5rKmCi7JXG6qmiobFJyAidVTnnNAMGj4jomfBxKGRM"),
    //   6,
    //   new PublicKey(USDC),
    //   new PublicKey("6cgYhBFWCc5sNHxkvSRhd5H9AdAHR41zKwuF37HmLry5"),
    //   6
    // );
    await test(
      client.umi,
      new PublicKey("EcdfYZCtaePaDWVy9Cz6eiS5QbLbhThau1fHLhQTEZqs"),
      new PublicKey(USDC),
      new PublicKey("EXrnNVfLagt3j4hCHSD9WqK75o6dkZBtjpnrSrSC78MA"),
      6,
      new PublicKey(POPCAT),
      new PublicKey("845oEvt1oduoBj5zQxTr21cWWaUVnRjGerJuW3yMo2nn"),
      9
    );

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

    // transactionItems.push(
    //   new TransactionItem(
    //     async (attemptNum) =>
    //       await buildSolautoRebalanceTransaction(client, undefined, attemptNum),
    //     "rebalance"
    //   )
    // );

    // const imfiAccount = await safeFetchMarginfiAccount(
    //   client.umi,
    //   // publicKey(client.intermediaryMarginfiAccountPk)
    //   publicKey("E8oukAkTMW4YsAPymMzWQHWb8egmGq9yjDtmMi6gfY18")
    // );

    // console.log(
    //   imfiAccount.lendingAccount.balances.map((x) => [
    //     x.bankPk.toString(),
    //     x.liabilityShares.value,
    //     bytesToI80F48(x.liabilityShares.value),
    //   ])
    // );

    // console.log(marginfiAccountEmpty(imfiAccount));

    const bank = await safeFetchBank(
      client.umi,
      publicKey("Dj3PndQ3j1vuga5ApiFWWAfQ4h3wBtgS2SeLZBT2LD4g")
    );

    console.log(bytesToI80F48(bank.config.interestRateConfig.protocolOriginationFee.value));
    return;

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
