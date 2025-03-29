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
  RebalanceDirection,
  SolautoRebalanceType,
  SolautoSettingsParameters,
  SwapType,
  TokenBalanceChangeType,
  TokenType,
} from "../../src/generated";
import {
  calcDebtUsd,
  calcNetWorthUsd,
  calcSupplyUsd,
  fromBaseUnit,
  fromBps,
  getLiqUtilzationRateBps,
  toBaseUnit,
} from "../../src/utils/numberUtils";
import {
  eligibleForNextAutomationPeriod,
  getUpdatedValueFromAutomation,
  positionStateWithLatestPrices,
} from "../../src/utils/solauto/generalUtils";
import { currentUnixSeconds } from "../../src/utils/generalUtils";
import { USDC } from "../../src/constants/tokenConstants";
import {
  buildHeliusApiUrl,
  fetchTokenPrices,
  getSolanaRpcConnection,
  safeGetPrice,
} from "../../src/utils";

const signer = setupTest(undefined, true);
const [conn, _] = getSolanaRpcConnection(
  buildHeliusApiUrl(process.env.HELIUS_API_URL!)
);

function assertAccurateRebalance(
  client: SolautoClient,
  expectedLiqUtilizationRateBps: number,
  targetLiqUtilizationRateBps?: number,
  expectedUsdToDcaIn?: number
) {
  const { rebalanceDirection, debtAdjustmentUsd, amountUsdToDcaIn } =
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
  adjustmentFeeBps = getSolautoFeesBps(
    client.referredBy !== undefined,
    targetLiqUtilizationRateBps,
    calcNetWorthUsd(client.solautoPositionState),
    rebalanceDirection
  ).total;

  assert(
    Math.round(amountUsdToDcaIn) === Math.round(expectedUsdToDcaIn ?? 0),
    `Expected DCA-in amount does not match ${Math.round(
      amountUsdToDcaIn
    )}, ${Math.round(expectedUsdToDcaIn ?? 0)}`
  );

  const newSupply =
    calcSupplyUsd(client.solautoPositionState) +
    (debtAdjustmentUsd - debtAdjustmentUsd * fromBps(adjustmentFeeBps)) +
    amountUsdToDcaIn;
  const newDebt = calcDebtUsd(client.solautoPositionState) + debtAdjustmentUsd;

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
    buildHeliusApiUrl(process.env.HELIUS_API_KEY!),
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
      lendingPlatform: LendingPlatform.Marginfi,
      protocolSupplyAccount: publicKey(PublicKey.default),
      protocolDebtAccount: publicKey(PublicKey.default),
      protocolUserAccount: publicKey(PublicKey.default),
      settings: settings,
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
      padding1: [],
      padding: [],
    },
    state: client.solautoPositionState!,
    rebalance: {
      ixs: {
        active: { val: true },
        rebalanceType: SolautoRebalanceType.Regular,
        swapType: SwapType.ExactIn,
        flashLoanAmount: BigInt(0),
        padding: [],
        padding1: [],
      },
      values: {
        rebalanceDirection: RebalanceDirection.Boost,
        targetSupplyUsd: BigInt(0),
        targetDebtUsd: BigInt(0),
        tokenBalanceChange: {
          changeType: TokenBalanceChangeType.None,
          amountUsd: BigInt(0),
          padding1: [],
        },
        padding: [],
        padding1: [],
      },
      padding: [],
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

  client.solautoPosition.data.state.lastRefreshed =
    BigInt(currentUnixSeconds());

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
