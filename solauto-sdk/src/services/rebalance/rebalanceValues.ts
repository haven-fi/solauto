import {
  RebalanceDirection,
  TokenBalanceChange,
  TokenBalanceChangeType,
} from "../../generated";
import { SolautoPositionEx } from "../../solautoPosition";
import {
  fromBps,
  getLiqUtilzationRateBps,
  maxRepayToBps,
  toBps,
} from "../../utils";
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
  liqThreshold: number,
  fees?: RebalanceFeesBps
): ApplyDebtAdjustmentResult {
  const newPos = { ...pos };
  const isBoost = debtAdjustmentUsd > 0;

  const daMinusSolautoFees =
    debtAdjustmentUsd - debtAdjustmentUsd * fromBps(fees?.solauto ?? 0);
  const daWithFlashLoan =
    debtAdjustmentUsd * (1.0 + fromBps(fees?.flashLoan ?? 0));

  let intermediaryLiqUtilizationRateBps = 0;
  if (isBoost) {
    newPos.debtUsd +=
      daWithFlashLoan * fromBps(fees?.lpBorrow ?? 0) + daWithFlashLoan;
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
  liqThresholdBps: number,
  pos: PositionValues,
  targetLiqUtilizationRateBps: number,
  fees?: RebalanceFeesBps
): DebtAdjustment {
  const isBoost =
    getLiqUtilzationRateBps(pos.supplyUsd, pos.debtUsd, liqThresholdBps) <
    targetLiqUtilizationRateBps;
  const liqThreshold = fromBps(liqThresholdBps);

  const targetUtilizationRate = fromBps(targetLiqUtilizationRateBps);
  const actualizedFee = 1.0 - fromBps(fees?.solauto ?? 0);
  const flFee = fromBps(fees?.flashLoan ?? 0);
  const lpBorrowFee = fromBps(fees?.lpBorrow ?? 0);

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
    liqThreshold,
    fees
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
  solautoPosition: SolautoPositionEx,
  targetLiqUtilizationRateBps: number | undefined,
  tokenBalanceChange: TokenBalanceChange | undefined
): number {
  if (targetLiqUtilizationRateBps !== undefined) {
    return targetLiqUtilizationRateBps;
  }

  const currentRate = solautoPosition.state().liqUtilizationRateBps;

  if (currentRate <= solautoPosition.boostFromBps()) {
    return solautoPosition.settings()!.boostToBps;
  } else if (currentRate >= solautoPosition.repayFromBps()) {
    return solautoPosition.settings()!.repayToBps;
  }
  // TODO: DCA, limit orders, take profit, stop loss, etc.
  //   else if (tokenBalanceChange !== null) {
  //     return currentRate;
  //   }

  throw new Error("Invalid rebalance condition");
}

function getAdjustedPositionValues(
  solautoPosition: SolautoPositionEx,
  tokenBalanceChange: TokenBalanceChange | undefined
): PositionValues {
  let supplyUsd = solautoPosition.supplyUsd();
  const debtUsd = solautoPosition.debtUsd();

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
  solautoPosition: SolautoPositionEx,
  targetLtvBps: number
): RebalanceDirection {
  return solautoPosition.state().liqUtilizationRateBps < targetLtvBps
    ? RebalanceDirection.Boost
    : RebalanceDirection.Repay;
}

export interface RebalanceValues extends DebtAdjustment {
  rebalanceDirection: RebalanceDirection;
  tokenBalanceChange?: TokenBalanceChange;
  repayingCloseToMaxLtv: boolean;
}

export function getRebalanceValues(
  solautoPosition: SolautoPositionEx,
  targetLiqUtilizationRateBps?: number,
  solautoFeeBps?: SolautoFeesBps,
  flFeeBps?: number
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
    solauto: solautoFeeBps
      ? solautoFeeBps.getSolautoFeesBps(rebalanceDirection).total
      : 0,
    lpBorrow: solautoPosition.state().debt.borrowFeeBps,
    flashLoan: flFeeBps ?? 0,
  };

  const debtAdjustment = getDebtAdjustment(
    solautoPosition.state().liqThresholdBps,
    position,
    targetRate,
    fees
  );

  const repayingCloseToMaxLtv =
    rebalanceDirection === RebalanceDirection.Repay &&
    targetRate >=
      maxRepayToBps(
        solautoPosition.state().maxLtvBps,
        solautoPosition.state().liqThresholdBps
      );

  return {
    ...debtAdjustment,
    rebalanceDirection,
    tokenBalanceChange,
    repayingCloseToMaxLtv,
  };
}
