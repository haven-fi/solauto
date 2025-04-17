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
  SOLAUTO_PROD_PROGRAM,
  SOLAUTO_TEST_PROGRAM,
  SolautoSettingsParametersInpArgs,
  toBaseUnit,
  TransactionsManager,
  USDC,
  deposit,
  openSolautoPosition,
  borrow,
  rebalance,
  withdraw,
  closeSolautoPosition,
  getMarginfiAccounts,
} from "../../src";

export async function e2eTransactionTest(
  signer: Signer,
  testProgram: boolean,
  lendingPlatform: LendingPlatform,
  withFlashLoan: boolean,
  showLogs?: boolean
) {
  const client = getClient(lendingPlatform, {
    signer,
    showLogs,
    rpcUrl: LOCAL_IRONFORGE_API_URL,
    programId: testProgram ? SOLAUTO_TEST_PROGRAM : SOLAUTO_PROD_PROGRAM,
  });

  const supplyMint = new PublicKey(NATIVE_MINT);
  const debtMint = new PublicKey(USDC);

  await client.initializeNewSolautoPosition({
    positionId: 1,
    lpPoolAccount: getMarginfiAccounts().defaultGroup,
    supplyMint,
    debtMint,
  });

  const [maxLtvBps, liqThresholdBps] =
    await client.pos.maxLtvAndLiqThresholdBps();
  const settings: SolautoSettingsParametersInpArgs = {
    boostToBps: maxBoostToBps(maxLtvBps, liqThresholdBps),
    boostGap: 50,
    repayToBps: maxRepayToBps(maxLtvBps, liqThresholdBps),
    repayGap: 50,
  };

  const supplyUsd = 100;
  const debtUsd = withFlashLoan ? 60 : 3;
  const [supplyPrice, debtPrice] = await fetchTokenPrices([
    supplyMint,
    debtMint,
  ]);

  const transactionItems = [
    openSolautoPosition(client, settings),
    deposit(
      client,
      toBaseUnit(supplyUsd / supplyPrice, client.pos.supplyMintInfo.decimals)
    ),
    borrow(
      client,
      toBaseUnit(debtUsd / debtPrice, client.pos.debtMintInfo.decimals)
    ),
    rebalance(client, 0),
    withdraw(client, "All"),
    closeSolautoPosition(client),
  ];

  const txManager = new TransactionsManager(client, undefined, "only-simulate");
  const statuses = await txManager.clientSend(transactionItems);

  consoleLog(statuses);
}
