import { describe, it, before } from "mocha";
import { PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { assert } from "chai";
import { SolautoMarginfiClient } from "../../src/clients/solautoMarginfiClient";
import { setupTest } from "../shared";
import { getRebalanceValues } from "../../src/utils/solauto/rebalanceUtils";
import { publicKey } from "@metaplex-foundation/umi";
import { SolautoClient } from "../../src/clients/solautoClient";
import {
  DCASettings,
  LendingPlatform,
  PositionType,
  SolautoRebalanceType,
  SolautoSettingsParameters,
  TokenType,
} from "../../src/generated";
import {
  fromBaseUnit,
  fromBps,
  getLiqUtilzationRateBps,
  getSolautoFeesBps,
  toBaseUnit,
} from "../../src/utils/numberUtils";
import { USD_DECIMALS } from "../../src/constants/generalAccounts";
import {
  createFakePositionState,
  eligibleForNextAutomationPeriod,
  getAdjustedSettingsFromAutomation,
  getUpdatedValueFromAutomation,
  positionStateWithLatestPrices,
} from "../../src/utils/solauto/generalUtils";
import {
  currentUnixSeconds,
  fetchTokenPrices,
  safeGetPrice,
} from "../../src/utils/generalUtils";
import { USDC } from "../../src/constants/tokenConstants";

const signer = setupTest(undefined, true);

function assertAccurateRebalance(
  client: SolautoClient,
  expectedLiqUtilizationRateBps: number,
  targetLiqUtilizationRateBps?: number,
  expectedUsdToDcaIn?: number
) {
  const { increasingLeverage, debtAdjustmentUsd, amountUsdToDcaIn } =
    getRebalanceValues(
      client.solautoPositionState!,
      client.solautoPositionSettings(),
      client.solautoPositionActiveDca(),
      currentUnixSeconds(),
      safeGetPrice(client.supplyMint)!,
      safeGetPrice(client.debtMint)!,
      targetLiqUtilizationRateBps
    );

  let adjustmentFeeBps = 0;
  if (increasingLeverage) {
    adjustmentFeeBps = getSolautoFeesBps(
      client.referredByState !== undefined,
      targetLiqUtilizationRateBps,
      fromBaseUnit(
        client.solautoPositionState?.netWorth.baseAmountUsdValue ?? BigInt(0),
        USD_DECIMALS
      )
    ).total;
  }

  assert(
    Math.round(amountUsdToDcaIn) === Math.round(expectedUsdToDcaIn ?? 0),
    `Expected DCA-in amount does not match ${Math.round(
      amountUsdToDcaIn
    )}, ${Math.round(expectedUsdToDcaIn ?? 0)}`
  );

  const newSupply =
    fromBaseUnit(
      client.solautoPositionState!.supply.amountUsed.baseAmountUsdValue,
      USD_DECIMALS
    ) +
    (debtAdjustmentUsd - debtAdjustmentUsd * fromBps(adjustmentFeeBps)) +
    amountUsdToDcaIn;
  const newDebt =
    fromBaseUnit(
      client.solautoPositionState!.debt.amountUsed.baseAmountUsdValue,
      USD_DECIMALS
    ) + debtAdjustmentUsd;

  const newLiqUtilizationRateBps = getLiqUtilzationRateBps(
    newSupply,
    newDebt,
    client.solautoPositionState!.liqThresholdBps
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
  settings: SolautoSettingsParameters,
  dca?: DCASettings
): Promise<SolautoClient> {
  const client = new SolautoMarginfiClient(
    process.env.HELIUS_API_KEY ?? "",
    true
  );
  await client.initialize({
    positionId: 1,
    signer,
    supplyMint: new PublicKey(NATIVE_MINT),
    debtMint: new PublicKey(USDC),
  });

  const supplyUsd = 1000;
  const maxLtvBps = 6400;
  const liqThresholdBps = 8181;
  client.solautoPositionState = await positionStateWithLatestPrices(
    createFakePositionState(
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
    )
  );

  client.solautoPositionData = {
    positionId: [1],
    bump: [0],
    selfManaged: {
      val: false,
    },
    authority: client.signer.publicKey,
    position: {
      dca: dca ?? {
        automation: {
          targetPeriods: 0,
          periodsPassed: 0,
          unixStartDate: BigInt(0),
          intervalSeconds: BigInt(0),
          padding1: [],
          padding: new Uint8Array([]),
        },
        dcaInBaseUnit: BigInt(0),
        tokenType: TokenType.Debt,
        padding: [],
      },
      lendingPlatform: LendingPlatform.Marginfi,
      supplyMint: publicKey(client.supplyMint),
      debtMint: publicKey(client.debtMint),
      protocolAccount: publicKey(PublicKey.default),
      settingParams: settings,
      padding1: [],
      padding: [],
    },
    state: client.solautoPositionState!,
    rebalance: {
      rebalanceType: SolautoRebalanceType.Regular,
      targetLiqUtilizationRateBps: 0,
      flashLoanAmount: BigInt(0),
      padding1: [],
      padding2: [],
      padding: new Uint8Array([]),
    },
    positionType: PositionType.Leverage,
    padding1: [],
    padding: [],
    publicKey: publicKey(PublicKey.default),
    header: {
      executable: false,
      lamports: {
        basisPoints: BigInt(0),
        decimals: 9,
        identifier: "SOL",
      },
      owner: publicKey(PublicKey.default),
    },
  };

  client.solautoPositionState!.lastUpdated = BigInt(currentUnixSeconds());

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

  const adjustedSettings = getAdjustedSettingsFromAutomation(
    settings,
    currentUnixSeconds()
  );
  const expectedLiqUtilizationRateBps =
    fakeLiqUtilizationRateBps <
    adjustedSettings.boostToBps - adjustedSettings.boostGap
      ? adjustedSettings.boostToBps
      : adjustedSettings.repayToBps;
  assertAccurateRebalance(client, expectedLiqUtilizationRateBps);
}

async function dcaRebalanceFromFakePosition(
  supplyPrice: number,
  debtPrice: number,
  fakeLiqUtilizationRateBps: number,
  settings: SolautoSettingsParameters,
  dca: DCASettings
) {
  const client = await getFakePosition(
    supplyPrice,
    debtPrice,
    fakeLiqUtilizationRateBps,
    settings,
    dca
  );

  const adjustedSettings = getAdjustedSettingsFromAutomation(
    settings,
    currentUnixSeconds()
  );
  const expectedLiqUtilizationRateBps =
    dca.dcaInBaseUnit > BigInt(0)
      ? Math.max(fakeLiqUtilizationRateBps, adjustedSettings.boostToBps)
      : adjustedSettings.boostToBps;

  const expectedDcaInAmount =
    dca.dcaInBaseUnit > BigInt(0) &&
    eligibleForNextAutomationPeriod(dca.automation, currentUnixSeconds())
      ? dca.dcaInBaseUnit -
        BigInt(
          Math.round(
            getUpdatedValueFromAutomation(
              Number(dca.dcaInBaseUnit),
              0,
              dca.automation,
              currentUnixSeconds()
            )
          )
        )
      : BigInt(0);
  const expectedUsdToDcaIn =
    fromBaseUnit(
      BigInt(Math.round(Number(expectedDcaInAmount))),
      client.solautoPositionState!.debt.decimals
    ) * debtPrice;

  assertAccurateRebalance(
    client,
    expectedLiqUtilizationRateBps,
    undefined,
    expectedUsdToDcaIn
  );
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
      automation: {
        targetPeriods: 0,
        periodsPassed: 0,
        unixStartDate: BigInt(0),
        intervalSeconds: BigInt(0),
        padding1: [],
        padding: new Uint8Array([]),
      },
      targetBoostToBps: 0,
      padding1: [],
      padding: new Uint8Array([]),
    });

    assertAccurateRebalance(client, 5000, 5000);
    assertAccurateRebalance(client, 1000, 1000);
  });

  it("Standard boost or repay", async () => {
    const settings: SolautoSettingsParameters = {
      automation: {
        targetPeriods: 0,
        periodsPassed: 0,
        unixStartDate: BigInt(0),
        intervalSeconds: BigInt(0),
        padding1: [],
        padding: new Uint8Array([]),
      },
      targetBoostToBps: 0,
      boostGap: 1000,
      boostToBps: 4000,
      repayGap: 1000,
      repayToBps: 7500,
      padding1: [],
      padding: new Uint8Array([]),
    };

    await rebalanceFromFakePosition(supplyPrice, debtPrice, 1000, settings);
    await rebalanceFromFakePosition(supplyPrice, debtPrice, 9000, settings);
  });

  it("Rebalance with settings automation", async () => {
    const settings: SolautoSettingsParameters = {
      automation: {
        targetPeriods: 2,
        periodsPassed: 1,
        intervalSeconds: BigInt(5),
        unixStartDate: BigInt(currentUnixSeconds() - 5),
        padding1: [],
        padding: new Uint8Array([]),
      },
      targetBoostToBps: 5000,
      boostGap: 1000,
      boostToBps: 4000,
      repayGap: 1000,
      repayToBps: 7500,
      padding1: [],
      padding: new Uint8Array([]),
    };
    await rebalanceFromFakePosition(supplyPrice, debtPrice, 3500, settings);

    settings.automation.targetPeriods = 5;
    await rebalanceFromFakePosition(supplyPrice, debtPrice, 3100, settings);

    settings.automation.periodsPassed = 0;
    settings.automation.unixStartDate = BigInt(currentUnixSeconds());
    await rebalanceFromFakePosition(supplyPrice, debtPrice, 3100, settings);
  });

  it("Rebalance DCA out", async () => {
    const settings: SolautoSettingsParameters = {
      automation: {
        targetPeriods: 4,
        periodsPassed: 0,
        intervalSeconds: BigInt(5),
        unixStartDate: BigInt(currentUnixSeconds()),
        padding1: [],
        padding: new Uint8Array([]),
      },
      targetBoostToBps: 0,
      boostGap: 1000,
      boostToBps: 4000,
      repayGap: 1000,
      repayToBps: 7500,
      padding1: [],
      padding: new Uint8Array([]),
    };
    const dca: DCASettings = {
      automation: {
        targetPeriods: 4,
        periodsPassed: 0,
        intervalSeconds: BigInt(5),
        unixStartDate: BigInt(currentUnixSeconds()),
        padding1: [],
        padding: new Uint8Array([]),
      },
      dcaInBaseUnit: BigInt(0),
      tokenType: TokenType.Debt,
      padding: [],
    };
    await dcaRebalanceFromFakePosition(
      supplyPrice,
      debtPrice,
      3500,
      settings,
      dca
    );

    settings.boostToBps = 1500;
    settings.automation.periodsPassed = 3;
    settings.automation.unixStartDate = BigInt(currentUnixSeconds() - 3 * 5);
    dca.automation.periodsPassed = 3;
    dca.automation.unixStartDate = BigInt(currentUnixSeconds() - 3 * 5);
    await dcaRebalanceFromFakePosition(
      supplyPrice,
      debtPrice,
      3500,
      settings,
      dca
    );
  });

  it("Rebalance DCA in", async () => {
    const settings: SolautoSettingsParameters = {
      automation: {
        targetPeriods: 3,
        periodsPassed: 0,
        intervalSeconds: BigInt(5),
        unixStartDate: BigInt(currentUnixSeconds()),
        padding1: [],
        padding: new Uint8Array([]),
      },
      targetBoostToBps: 5000,
      boostGap: 1000,
      boostToBps: 4000,
      repayGap: 1000,
      repayToBps: 7500,
      padding1: [],
      padding: new Uint8Array([]),
    };
    const dca: DCASettings = {
      automation: {
        targetPeriods: 4,
        periodsPassed: 0,
        intervalSeconds: BigInt(5),
        unixStartDate: BigInt(currentUnixSeconds()),
        padding1: [],
        padding: new Uint8Array([]),
      },
      dcaInBaseUnit: toBaseUnit(debtPrice * 300, 6),
      tokenType: TokenType.Debt,
      padding: [],
    };
    await dcaRebalanceFromFakePosition(
      supplyPrice,
      debtPrice,
      3500,
      settings,
      dca
    );
  });
});
