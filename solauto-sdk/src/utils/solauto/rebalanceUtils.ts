import { PublicKey } from "@solana/web3.js";
import { SolautoClient } from "../../clients/solautoClient";
import {
  DCASettings,
  FeeType,
  PositionState,
  PositionTokenUsage,
  SolautoSettingsParameters,
} from "../../generated";
import {
  eligibleForNextAutomationPeriod,
  getAdjustedSettingsFromAutomation,
  getUpdatedValueFromAutomation,
} from "./generalUtils";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { QuoteResponse } from "@jup-ag/api";
import { JupSwapDetails } from "../jupiterUtils";
import { currentUnixSeconds } from "../generalUtils";
import {
  fromBaseUnit,
  fromBps,
  getDebtAdjustmentUsd,
  getLiqUtilzationRateBps,
  getMaxLiqUtilizationRateBps,
  getSolautoFeesBps,
  toBaseUnit,
} from "../numberUtils";
import { USD_DECIMALS } from "../../constants/generalAccounts";
import {
  DEFAULT_LIMIT_GAP_BPS,
  MIN_POSITION_STATE_FRESHNESS_SECS,
  PRICES,
} from "../../constants/solautoConstants";

function getAdditionalAmountToDcaIn(dca: DCASettings): number {
  if (dca.debtToAddBaseUnit === BigInt(0)) {
    return 0;
  }

  const debtBalance = Number(dca.debtToAddBaseUnit);
  const updatedDebtBalance = getUpdatedValueFromAutomation(
    debtBalance,
    0,
    dca.automation,
    currentUnixSeconds()
  );

  return debtBalance - updatedDebtBalance;
}

function getStandardTargetLiqUtilizationRateBps(
  state: PositionState,
  settings: SolautoSettingsParameters
): number {
  const adjustedSettings = getAdjustedSettingsFromAutomation(
    settings,
    currentUnixSeconds()
  );

  const repayFrom = settings.repayToBps + settings.repayGap;
  const boostFrom = adjustedSettings.boostToBps - settings.boostGap;

  if (state.liqUtilizationRateBps < boostFrom) {
    return adjustedSettings.boostToBps;
  } else if (state.liqUtilizationRateBps > repayFrom) {
    return adjustedSettings.repayToBps;
  } else {
    throw new Error("Invalid rebalance condition");
  }
}

function targetLiqUtilizationRateBpsFromDCA(
  state: PositionState,
  settings: SolautoSettingsParameters,
  dca: DCASettings,
  currentUnixTime: number
) {
  const adjustedSettings = getAdjustedSettingsFromAutomation(
    settings,
    currentUnixTime
  );

  let targetRateBps = 0;
  if (dca.debtToAddBaseUnit > BigInt(0)) {
    targetRateBps = Math.max(
      state.liqUtilizationRateBps,
      adjustedSettings.boostToBps
    );
  } else {
    targetRateBps = adjustedSettings.boostToBps;
  }
  return targetRateBps;
}

function isDcaRebalance(
  state: PositionState,
  settings: SolautoSettingsParameters,
  dca: DCASettings | undefined,
  currentUnixTime: number
): boolean {
  if (dca === undefined || dca.automation.targetPeriods === 0) {
    return false;
  }

  const adjustedSettings = getAdjustedSettingsFromAutomation(
    settings,
    currentUnixTime
  );

  if (
    state.liqUtilizationRateBps >
    adjustedSettings.repayToBps + adjustedSettings.repayGap
  ) {
    return false;
  }

  if (!eligibleForNextAutomationPeriod(dca.automation, currentUnixTime)) {
    return false;
  }

  return true;
}

function getTargetRateAndDcaAmount(
  state: PositionState,
  settings: SolautoSettingsParameters | undefined,
  dca: DCASettings | undefined,
  currentUnixTime: number,
  targetLiqUtilizationRateBps?: number
): { targetRateBps: number; amountToDcaIn?: number } {
  if (targetLiqUtilizationRateBps !== undefined) {
    return {
      targetRateBps: targetLiqUtilizationRateBps,
    };
  }

  if (settings === undefined) {
    throw new Error(
      "If rebalancing a self-managed position, settings and DCA should be provided"
    );
  }

  if (isDcaRebalance(state, settings, dca, currentUnixTime)) {
    const amountToDcaIn = getAdditionalAmountToDcaIn(dca!);
    const targetLiqUtilizationRateBps = targetLiqUtilizationRateBpsFromDCA(
      state,
      settings,
      dca!,
      currentUnixTime
    );

    return {
      targetRateBps: targetLiqUtilizationRateBps,
      amountToDcaIn,
    };
  } else {
    return {
      targetRateBps: getStandardTargetLiqUtilizationRateBps(state, settings),
    };
  }
}

export interface RebalanceValues {
  increasingLeverage: boolean;
  debtAdjustmentUsd: number;
  amountToDcaIn: number;
  amountUsdToDcaIn: number;
}

export function getRebalanceValues(
  state: PositionState,
  settings: SolautoSettingsParameters | undefined,
  dca: DCASettings | undefined,
  feeType: FeeType,
  currentUnixTime: number,
  supplyPrice: number,
  debtPrice: number,
  targetLiqUtilizationRateBps?: number,
  limitGapBps?: number
): RebalanceValues {
  if (
    state === undefined ||
    state.lastUpdated <
      BigInt(
        Math.round(currentUnixSeconds() - MIN_POSITION_STATE_FRESHNESS_SECS)
      )
  ) {
    throw new Error("Requires a fresh position state to get rebalance details");
  }

  const { targetRateBps, amountToDcaIn } = getTargetRateAndDcaAmount(
    state,
    settings,
    dca,
    currentUnixTime,
    targetLiqUtilizationRateBps
  );

  const amountUsdToDcaIn =
    fromBaseUnit(BigInt(Math.round(amountToDcaIn ?? 0)), state.debt.decimals) *
    debtPrice;

  const increasingLeverage =
    amountUsdToDcaIn > 0 || state.liqUtilizationRateBps < targetRateBps;
  let adjustmentFeeBps = 0;
  if (increasingLeverage) {
    adjustmentFeeBps = getSolautoFeesBps(
      false,
      feeType,
      fromBaseUnit(state.netWorth.baseAmountUsdValue, USD_DECIMALS)
    ).total;
  }

  const supplyUsd =
    fromBaseUnit(state.supply.amountUsed.baseAmountUsdValue, USD_DECIMALS) +
    amountUsdToDcaIn;
  const debtUsd = fromBaseUnit(
    state.debt.amountUsed.baseAmountUsdValue,
    USD_DECIMALS
  );
  let debtAdjustmentUsd = getDebtAdjustmentUsd(
    state.liqThresholdBps,
    supplyUsd,
    debtUsd,
    targetRateBps,
    adjustmentFeeBps
  );

  const input = increasingLeverage ? state.debt : state.supply;
  const inputMarketPrice = increasingLeverage ? debtPrice : supplyPrice;

  const limitGap = limitGapBps
    ? fromBps(limitGapBps)
    : fromBps(DEFAULT_LIMIT_GAP_BPS);

  if (
    debtAdjustmentUsd > 0 &&
    toBaseUnit(debtAdjustmentUsd / inputMarketPrice, input.decimals) >
      input.amountCanBeUsed.baseUnit
  ) {
    const maxUsageUsd =
      fromBaseUnit(input.amountCanBeUsed.baseUnit, input.decimals) *
      inputMarketPrice *
      limitGap;
    debtAdjustmentUsd = maxUsageUsd - maxUsageUsd * limitGap;
  }

  return {
    increasingLeverage,
    debtAdjustmentUsd,
    amountToDcaIn: amountToDcaIn ?? 0,
    amountUsdToDcaIn,
  };
}

export interface FlashLoanDetails {
  baseUnitAmount: bigint;
  mint: PublicKey;
}

export function getFlashLoanDetails(
  client: SolautoClient,
  values: RebalanceValues,
  jupQuote: QuoteResponse
): FlashLoanDetails | undefined {
  let supplyUsd = fromBaseUnit(
    client.solautoPositionState!.supply.amountUsed.baseAmountUsdValue,
    USD_DECIMALS
  );
  let debtUsd = fromBaseUnit(
    client.solautoPositionState!.debt.amountUsed.baseAmountUsdValue,
    USD_DECIMALS
  );

  const debtAdjustmentWithSlippage =
    Math.abs(values.debtAdjustmentUsd) +
    Math.abs(values.debtAdjustmentUsd) * fromBps(jupQuote.slippageBps);
  supplyUsd =
    values.debtAdjustmentUsd < 0
      ? supplyUsd - debtAdjustmentWithSlippage
      : supplyUsd;
  debtUsd =
    values.debtAdjustmentUsd > 0
      ? debtUsd + debtAdjustmentWithSlippage
      : debtUsd;

  const tempLiqUtilizationRateBps = getLiqUtilzationRateBps(
    supplyUsd,
    debtUsd,
    client.solautoPositionState!.liqThresholdBps
  );
  const requiresFlashLoan =
    supplyUsd <= 0 ||
    tempLiqUtilizationRateBps >
      getMaxLiqUtilizationRateBps(
        client.solautoPositionState!.maxLtvBps,
        client.solautoPositionState!.liqThresholdBps,
        0.01
      );

  let flashLoanToken: PositionTokenUsage | undefined = undefined;
  let flashLoanTokenPrice = 0;
  if (values.increasingLeverage) {
    flashLoanToken = client.solautoPositionState!.debt;
    flashLoanTokenPrice = PRICES[client.debtMint.toString()].price;
  } else {
    flashLoanToken = client.solautoPositionState!.supply;
    flashLoanTokenPrice = PRICES[client.supplyMint.toString()].price;
  }

  const exactAmountBaseUnit =
    jupQuote && jupQuote.swapMode === "ExactOut"
      ? BigInt(parseInt(jupQuote.inAmount))
      : undefined;

  return requiresFlashLoan
    ? {
        baseUnitAmount: exactAmountBaseUnit
          ? exactAmountBaseUnit +
            BigInt(
              Math.round(
                Number(exactAmountBaseUnit) * fromBps(jupQuote.slippageBps)
              )
            )
          : toBaseUnit(
              debtAdjustmentWithSlippage / flashLoanTokenPrice,
              flashLoanToken.decimals
            ),
        mint: toWeb3JsPublicKey(flashLoanToken.mint),
      }
    : undefined;
}

export function getJupSwapRebalanceDetails(
  client: SolautoClient,
  values: RebalanceValues,
  targetLiqUtilizationRateBps?: number,
  attemptNum?: number
): JupSwapDetails {
  const input = values.increasingLeverage
    ? client.solautoPositionState!.debt
    : client.solautoPositionState!.supply;
  const output = values.increasingLeverage
    ? client.solautoPositionState!.supply
    : client.solautoPositionState!.debt;

  const usdToSwap =
    Math.abs(values.debtAdjustmentUsd) + values.amountUsdToDcaIn;

  const inputPrice = values.increasingLeverage
    ? PRICES[client.debtMint.toString()].price
    : PRICES[client.supplyMint.toString()].price;
  const inputAmount = toBaseUnit(usdToSwap / inputPrice!, input.decimals);

  const rebalancingToZero = targetLiqUtilizationRateBps === 0;
  return {
    inputMint: toWeb3JsPublicKey(input.mint),
    outputMint: toWeb3JsPublicKey(output.mint),
    destinationWallet: client.solautoPosition,
    slippageBpsIncFactor: 0.25 + (attemptNum ?? 0) * 0.2,
    amount: rebalancingToZero
      ? client.solautoPositionState!.debt.amountUsed.baseUnit +
        BigInt(
          Math.round(
            Number(client.solautoPositionState!.debt.amountUsed.baseUnit) *
              // Add this small percentage to account for the APR on the debt between now and the transaction
              0.0001
          )
        )
      : inputAmount,
    exactOut: rebalancingToZero,
  };
}
