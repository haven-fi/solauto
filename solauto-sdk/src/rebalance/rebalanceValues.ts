import { fromBps, getLiqUtilzationRateBps, toBps } from "../utils";

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
  lpFlashLoan: number;
  lpBorrow: number;
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
  const daWithFlashLoan = debtAdjustmentUsd * (1.0 + fromBps(fees.lpFlashLoan));

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
  const flFee = fromBps(fees.lpFlashLoan);
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
