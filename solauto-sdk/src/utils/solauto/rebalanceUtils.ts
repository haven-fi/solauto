import { PublicKey } from "@solana/web3.js";
import { SolautoClient } from "../../clients/solautoClient";
import { FeeType, PositionTokenUsage } from "../../generated";
import {
  eligibleForNextAutomationPeriod,
  getAdjustedSettingsFromAutomation,
  getSolautoFeesBps,
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
  getMaxLiqUtilizationRate,
  toBaseUnit,
} from "../numberUtils";
import { USD_DECIMALS } from "../../constants/generalAccounts";
import {
  DEFAULT_LIMIT_GAP_BPS,
  MIN_POSITION_STATE_FRESHNESS_SECS,
  PRICES,
} from "../../constants/solautoConstants";

function getAdditionalAmountToDcaIn(client: SolautoClient): number {
  const dca = client.solautoPositionActiveDca()!;
  if (dca.debtToAddBaseUnit === BigInt(0)) {
    return 0;
  }

  const debtBalance =
    Number(client.solautoPositionData?.position.dca.debtToAddBaseUnit ?? 0) +
    Number(client.livePositionUpdates.debtTaBalanceAdjustment ?? 0);
  const updatedDebtBalance = getUpdatedValueFromAutomation(
    debtBalance,
    0,
    dca.automation,
    currentUnixSeconds()
  );

  return debtBalance - updatedDebtBalance;
}

function getStandardTargetLiqUtilizationRateBps(client: SolautoClient): number {
  if (!client.selfManaged) {
    const adjustedSettings = getAdjustedSettingsFromAutomation(
      client.solautoPositionSettings()!,
      currentUnixSeconds()
    );

    const repayFrom = adjustedSettings.repayToBps - adjustedSettings.repayGap;
    const boostFrom = adjustedSettings.boostToBps + adjustedSettings.boostGap;

    if (client.solautoPositionState!.liqUtilizationRateBps < boostFrom) {
      return adjustedSettings.boostToBps;
    } else if (
      client.solautoPositionState!.liqUtilizationRateBps > repayFrom ||
      repayFrom - client.solautoPositionState!.liqUtilizationRateBps <
        repayFrom * 0.015
    ) {
      return adjustedSettings.repayToBps;
    } else {
      throw new Error("Invalid rebalance condition");
    }
  } else {
    throw new Error(
      "This is a self-managed position, a targetLiqUtilizationRateBps must be provided initiate a rebalance"
    );
  }
}

function targetLiqUtilizationRateBpsFromDCA(client: SolautoClient) {
  const adjustedSettings = getAdjustedSettingsFromAutomation(
    client.solautoPositionSettings()!,
    currentUnixSeconds()
  );

  let targetRateBps = 0;
  if (client.solautoPositionActiveDca()!.debtToAddBaseUnit > BigInt(0)) {
    targetRateBps = Math.max(
      client.solautoPositionState!.liqUtilizationRateBps,
      adjustedSettings.boostToBps
    );
  } else {
    targetRateBps = adjustedSettings.boostToBps;
  }
  return targetRateBps;
}

function isDcaRebalance(client: SolautoClient): boolean {
  if (client.solautoPositionActiveDca() === undefined || client.selfManaged) {
    return false;
  }

  const adjustedSettings = getAdjustedSettingsFromAutomation(
    client.solautoPositionSettings()!,
    currentUnixSeconds()
  );

  if (
    client.solautoPositionState!.liqUtilizationRateBps >
    adjustedSettings.repayToBps + adjustedSettings.repayGap
  ) {
    return false;
  }

  if (client.solautoPositionActiveDca()!.automation.targetPeriods === 0) {
    return false;
  }

  if (
    !eligibleForNextAutomationPeriod(
      client.solautoPositionActiveDca()!.automation
    )
  ) {
    return false;
  }

  return true;
}

function getTargetRateAndDcaAmount(
  client: SolautoClient,
  targetLiqUtilizationRateBps?: number
): { targetRateBps: number; amountToDcaIn?: number } {
  if (targetLiqUtilizationRateBps !== undefined) {
    return {
      targetRateBps: targetLiqUtilizationRateBps,
    };
  }

  if (isDcaRebalance(client)) {
    const amountToDcaIn = getAdditionalAmountToDcaIn(client);
    const targetLiqUtilizationRateBps =
      targetLiqUtilizationRateBpsFromDCA(client);

    return {
      targetRateBps: targetLiqUtilizationRateBps,
      amountToDcaIn,
    };
  } else {
    return {
      targetRateBps: getStandardTargetLiqUtilizationRateBps(client),
    };
  }
}

export interface RebalanceValues {
  increasingLeverage: boolean;
  debtAdjustmentUsd: number;
  amountUsdToDcaIn: number;
}

export function getRebalanceValues(
  client: SolautoClient,
  targetLiqUtilizationRateBps?: number,
  limitGapBps?: number
): RebalanceValues {
  if (
    client.solautoPositionState === undefined ||
    client.solautoPositionState.lastUpdated <
      BigInt(
        Math.round(currentUnixSeconds() - MIN_POSITION_STATE_FRESHNESS_SECS)
      )
  ) {
    throw new Error("Requires a fresh position state to get rebalance details");
  }

  const { targetRateBps, amountToDcaIn } = getTargetRateAndDcaAmount(
    client,
    targetLiqUtilizationRateBps
  );

  const amountUsdToDcaIn =
    fromBaseUnit(
      BigInt(Math.round(amountToDcaIn ?? 0)),
      client.solautoPositionState!.debt.decimals
    ) * PRICES[client.debtMint.toString()].price;

  const increasingLeverage =
    amountUsdToDcaIn > 0 ||
    client.solautoPositionState!.liqUtilizationRateBps < targetRateBps;
  let adjustmentFeeBps = 0;
  if (increasingLeverage) {
    adjustmentFeeBps = getSolautoFeesBps(
      client.referredByState !== undefined,
      client.solautoPositionData?.feeType ?? FeeType.Small
    ).total;
  }

  const supplyUsd =
    fromBaseUnit(
      client.solautoPositionState!.supply.amountUsed.baseAmountUsdValue,
      USD_DECIMALS
    ) + amountUsdToDcaIn;
  const debtUsd = fromBaseUnit(
    client.solautoPositionState!.debt.amountUsed.baseAmountUsdValue,
    USD_DECIMALS
  );
  let debtAdjustmentUsd = getDebtAdjustmentUsd(
    client.solautoPositionState!.liqThresholdBps,
    supplyUsd,
    debtUsd,
    targetRateBps,
    adjustmentFeeBps
  );

  const input = increasingLeverage
    ? client.solautoPositionState!.debt
    : client.solautoPositionState!.supply;
  const inputMarketPrice = increasingLeverage
    ? PRICES[client.debtMint.toString()].price
    : PRICES[client.supplyMint.toString()].price;

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
      getMaxLiqUtilizationRate(
        client.solautoPositionState!.maxLtvBps,
        client.solautoPositionState!.liqThresholdBps
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
    slippageBpsIncFactor: 0.1 + ((attemptNum ?? 0) * 0.2),
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
