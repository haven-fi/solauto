import {
  RebalanceDirection,
  SolautoPosition,
  SolautoSettingsParameters,
  TokenBalanceChange,
  TokenBalanceChangeType,
} from "../generated";
import {
  calcDebtUsd,
  calcSupplyUsd,
  fromBps,
  fromRoundedUsdValue,
  getLiqUtilzationRateBps,
  toBps,
} from "../utils";
import { SolautoFeesBps } from "./solautoFees";

export interface PositionValues {
  supplyUsd: number;
  debtUsd: number;
}

export interface DebtAdjustment {
  debtAdjustmentUsd: number;
  endResult: PositionValues;
  intermediaryLiqUtilizationRateBps: number;
}

export interface RebalanceFeesBps {
  solauto: number;
  lpBorrow: number;
  flashLoan: number;
}

interface ApplyDebtAdjustmentResult {
  newPos: PositionValues;
  intermediaryLiqUtilizationRateBps: number;
}

export function applyDebtAdjustmentUsd(
  debtAdjustmentUsd: number,
  pos: PositionValues,
  fees: RebalanceFeesBps,
  liqThreshold: number
): ApplyDebtAdjustmentResult {
  const newPos = { ...pos };
  const isBoost = debtAdjustmentUsd > 0;

  const daMinusSolautoFees =
    debtAdjustmentUsd - debtAdjustmentUsd * fromBps(fees.solauto);
  const daWithFlashLoan = debtAdjustmentUsd * (1.0 + fromBps(fees.flashLoan));

  let intermediaryLiqUtilizationRateBps = 0;
  if (isBoost) {
    newPos.debtUsd +=
      daWithFlashLoan * fromBps(fees.lpBorrow) + daWithFlashLoan;
    intermediaryLiqUtilizationRateBps = getLiqUtilzationRateBps(
      newPos.supplyUsd,
      newPos.debtUsd,
      toBps(liqThreshold)
    );
    newPos.supplyUsd += daMinusSolautoFees;
  } else {
    newPos.supplyUsd += daWithFlashLoan;
    intermediaryLiqUtilizationRateBps = getLiqUtilzationRateBps(
      newPos.supplyUsd,
      newPos.debtUsd,
      toBps(liqThreshold)
    );
    newPos.debtUsd += daMinusSolautoFees;
  }

  return { newPos, intermediaryLiqUtilizationRateBps };
}

export function getDebtAdjustment(
  liqThreshold: number,
  pos: PositionValues,
  fees: RebalanceFeesBps,
  targetLiqUtilizationRateBps: number
): DebtAdjustment {
  const isBoost =
    getLiqUtilzationRateBps(pos.supplyUsd, pos.debtUsd, toBps(liqThreshold)) <
    targetLiqUtilizationRateBps;

  const targetUtilizationRate = fromBps(targetLiqUtilizationRateBps);
  const actualizedFee = 1.0 - fromBps(fees.solauto);
  const flFee = fromBps(fees.flashLoan);
  const lpBorrowFee = fromBps(fees.lpBorrow);

  const debtAdjustmentUsd = isBoost
    ? (targetUtilizationRate * liqThreshold * pos.supplyUsd - pos.debtUsd) /
      (1.0 +
        lpBorrowFee +
        flFee -
        targetUtilizationRate * actualizedFee * liqThreshold)
    : (targetUtilizationRate * liqThreshold * pos.supplyUsd - pos.debtUsd) /
      (actualizedFee - targetUtilizationRate * liqThreshold * (1.0 + flFee));

  const newPos = applyDebtAdjustmentUsd(
    debtAdjustmentUsd,
    pos,
    fees,
    liqThreshold
  );

  return {
    debtAdjustmentUsd,
    endResult: newPos.newPos,
    intermediaryLiqUtilizationRateBps: newPos.intermediaryLiqUtilizationRateBps,
  };
}

function getTokenBalanceChange(): TokenBalanceChange | undefined {
  // TODO: DCA, limit orders, take profit, stop loss, etc.
  return undefined;
}

function getTargetLiqUtilizationRateBps(
  solautoPosition: SolautoPosition,
  targetLiqUtilizationRateBps: number | undefined,
  tokenBalanceChange: TokenBalanceChange | undefined
): number {
  if (targetLiqUtilizationRateBps !== undefined) {
    return targetLiqUtilizationRateBps;
  }

  const currentRate = solautoPosition.state.liqUtilizationRateBps;
  const settings = solautoPosition.position.settingParams;

  if (currentRate <= settings.boostToBps - settings.boostGap) {
    return settings.boostToBps;
  } else if (currentRate >= settings.repayToBps + settings.repayGap) {
    return settings.repayToBps;
  } else if (tokenBalanceChange !== null) {
    // TODO: DCA, limit orders, take profit, stop loss, etc.
    return currentRate;
  }

  throw new Error("Invalid rebalance condition");
}

function getAdjustedPositionValues(
  solautoPosition: SolautoPosition,
  tokenBalanceChange: TokenBalanceChange | undefined
): PositionValues {
  let supplyUsd = calcSupplyUsd(solautoPosition.state);
  const debtUsd = calcDebtUsd(solautoPosition.state);

  if (tokenBalanceChange) {
    const tb = tokenBalanceChange;
    switch (tb.changeType) {
      case TokenBalanceChangeType.PreSwapDeposit:
      case TokenBalanceChangeType.PostSwapDeposit:
        supplyUsd += Number(tb.amountUsd);
        break;
      case TokenBalanceChangeType.PostRebalanceWithdrawDebtToken:
      case TokenBalanceChangeType.PostRebalanceWithdrawSupplyToken:
        supplyUsd -= Number(tb.amountUsd);
        break;
      default:
        break;
    }
  }

  return {
    supplyUsd,
    debtUsd,
  };
}

function getRebalanceDirection(
  solautoPosition: SolautoPosition,
  targetLtvBps: number
): RebalanceDirection {
  return solautoPosition.state.liqUtilizationRateBps < targetLtvBps
    ? RebalanceDirection.Boost
    : RebalanceDirection.Repay;
}

export interface RebalanceValues extends DebtAdjustment {
  rebalanceDirection: RebalanceDirection;
  tokenBalanceChange?: TokenBalanceChange;
}

export function getRebalanceValues(
  solautoPosition: SolautoPosition,
  solautoFeeBps: SolautoFeesBps,
  flFeeBps: number,
  targetLiqUtilizationRateBps?: number
): RebalanceValues {
  const tokenBalanceChange = getTokenBalanceChange();

  const targetRate = getTargetLiqUtilizationRateBps(
    solautoPosition,
    targetLiqUtilizationRateBps,
    tokenBalanceChange
  );

  const rebalanceDirection = getRebalanceDirection(solautoPosition, targetRate);

  const position = getAdjustedPositionValues(
    solautoPosition,
    tokenBalanceChange
  );

  const fees: RebalanceFeesBps = {
    solauto: solautoFeeBps.getSolautoFeesBps(rebalanceDirection).total,
    lpBorrow: solautoPosition.state.debt.borrowFeeBps,
    flashLoan: flFeeBps,
  };

  const debtAdjustment = getDebtAdjustment(
    fromBps(solautoPosition.state.liqThresholdBps),
    position,
    fees,
    targetRate
  );

  return {
    ...debtAdjustment,
    rebalanceDirection,
    tokenBalanceChange,
  };
}
