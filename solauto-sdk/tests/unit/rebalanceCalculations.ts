import { describe, it, before } from "mocha";
import { assert } from "chai";
import { PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { publicKey } from "@metaplex-foundation/umi";
import { setupTest } from "../shared";
import {
  LOCAL_IRONFORGE_API_URL,
  USDC,
  fromBps,
  getLiqUtilzationRateBps,
  getClient,
  fetchTokenPrices,
  safeGetPrice,
  LendingPlatform,
  PriceType,
  SolautoSettingsParameters,
  getRebalanceValues,
  SolautoClient,
  SolautoFeesBps,
  createFakePositionState,
  MarginfiSolautoPositionEx,
} from "../../src";

const signer = setupTest(undefined, true);

function assertAccurateRebalance(
  client: SolautoClient,
  expectedLiqUtilizationRateBps: number,
  targetLiqUtilizationRateBps?: number
) {
  const { endResult } = getRebalanceValues(
    client.pos,
    PriceType.Realtime,
    targetLiqUtilizationRateBps,
    SolautoFeesBps.create(
      false,
      targetLiqUtilizationRateBps,
      client.pos.netWorthUsd()
    ),
    50
  );

  const newLiqUtilizationRateBps = getLiqUtilzationRateBps(
    endResult.supplyUsd,
    endResult.debtUsd,
    client.pos.state.liqThresholdBps
  );
  assert(
    Math.round(newLiqUtilizationRateBps) ===
      Math.round(expectedLiqUtilizationRateBps),
    `Expected liq utilization rate does not match ${newLiqUtilizationRateBps}, ${expectedLiqUtilizationRateBps}`
  );
}

async function getFakePosition(
  supplyPrice: number,
  debtPrice: number,
  fakeLiqUtilizationRateBps: number,
  settings: SolautoSettingsParameters
): Promise<SolautoClient> {
  const client = getClient(LendingPlatform.Marginfi, {
    signer,
    rpcUrl: LOCAL_IRONFORGE_API_URL,
  });
  await client.initialize({
    positionId: 1,
    supplyMint: new PublicKey(NATIVE_MINT),
    debtMint: new PublicKey(USDC),
  });

  const supplyUsd = 1000;
  const maxLtvBps = 6400;
  const liqThresholdBps = 8181;

  const fakeState = createFakePositionState(
    {
      amountUsed: supplyUsd / supplyPrice,
      price: safeGetPrice(NATIVE_MINT)!,
      mint: NATIVE_MINT,
    },
    {
      amountUsed:
        (supplyUsd *
          fromBps(liqThresholdBps) *
          fromBps(fakeLiqUtilizationRateBps)) /
        debtPrice,
      price: 1,
      mint: new PublicKey(USDC),
    },
    maxLtvBps,
    liqThresholdBps
  );

  client.pos = new MarginfiSolautoPositionEx({
    umi: client.umi,
    publicKey: PublicKey.default,
    data: {
      state: fakeState,
      position: {
        lendingPlatform: LendingPlatform.Marginfi,
        lpUserAccount: publicKey(PublicKey.default),
        lpSupplyAccount: publicKey(PublicKey.default),
        lpDebtAccount: publicKey(PublicKey.default),
        settings,
        dca: null,
        padding: [],
        padding1: [],
      },
    },
  });

  return client;
}

async function rebalanceFromFakePosition(
  supplyPrice: number,
  debtPrice: number,
  fakeLiqUtilizationRateBps: number,
  settings: SolautoSettingsParameters
) {
  const client = await getFakePosition(
    supplyPrice,
    debtPrice,
    fakeLiqUtilizationRateBps,
    settings
  );

  const expectedLiqUtilizationRateBps =
    fakeLiqUtilizationRateBps < settings.boostToBps - settings.boostGap
      ? settings.boostToBps
      : settings.repayToBps;
  assertAccurateRebalance(client, expectedLiqUtilizationRateBps);
}

describe("Rebalance tests", async () => {
  let supplyPrice: number, debtPrice: number;

  before(async () => {
    [supplyPrice, debtPrice] = await fetchTokenPrices([
      NATIVE_MINT,
      new PublicKey(USDC),
    ]);
  });

  it("Standard rebalance with target rate", async () => {
    const client = await getFakePosition(supplyPrice, debtPrice, 3450, {
      boostToBps: 500,
      boostGap: 100,
      repayToBps: 7000,
      repayGap: 250,
      padding: [],
    });

    assertAccurateRebalance(client, 5000, 5000);
    assertAccurateRebalance(client, 1000, 1000);
  });

  it("Standard boost or repay", async () => {
    const settings: SolautoSettingsParameters = {
      boostGap: 1000,
      boostToBps: 4000,
      repayGap: 1000,
      repayToBps: 7500,
      padding: [],
    };

    await rebalanceFromFakePosition(supplyPrice, debtPrice, 1000, settings);
    await rebalanceFromFakePosition(supplyPrice, debtPrice, 9000, settings);
  });
});
