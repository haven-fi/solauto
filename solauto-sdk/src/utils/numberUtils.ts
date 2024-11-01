import { BASIS_POINTS, MIN_REPAY_GAP_BPS } from "../constants";
import { RebalanceDirection } from "../generated";

export function getLiqUtilzationRateBps(
  supplyUsd: number,
  debtUsd: number,
  liqThresholdBps: number
): number {
  if (supplyUsd === 0 || debtUsd === 0) {
    return 0;
  }

  return toBps(debtUsd / (supplyUsd * fromBps(liqThresholdBps)));
}

export function toBaseUnit(value: number, decimals: number): bigint {
  return BigInt(Math.round(value * Math.pow(10, decimals)));
}

export function fromBaseUnit(value: bigint, decimals: number): number {
  return Number(value) / Math.pow(10, decimals);
}

export function fromBps(value: number): number {
  return value / BASIS_POINTS;
}

export function toBps(value: number): number {
  return Math.round(value * BASIS_POINTS);
}

export function bytesToI80F48(bytes: number[]): number {
  if (bytes.length !== 16) {
    throw new Error("Byte array must be exactly 16 bytes.");
  }

  const reversedBytes = bytes.slice().reverse();

  let integerPart = BigInt(0);
  let fractionalPart = BigInt(0);

  for (let i = 0; i < 10; i++) {
    integerPart = (integerPart << 8n) | BigInt(reversedBytes[i]);
  }

  for (let i = 10; i < 16; i++) {
    fractionalPart = (fractionalPart << 8n) | BigInt(reversedBytes[i]);
  }

  const fullValue = integerPart * BigInt(2 ** 48) + fractionalPart;

  return Number(fullValue) / 2 ** 48;
}

export function uint8ArrayToBigInt(uint8Array: Uint8Array): bigint {
  if (uint8Array.length !== 8) {
    throw new Error(
      "Uint8Array must be exactly 8 bytes long to convert to u64."
    );
  }

  const buffer = uint8Array.buffer;

  const dataView = new DataView(buffer);

  const low = dataView.getUint32(0, true);
  const high = dataView.getUint32(4, true);

  return (BigInt(high) << 32n) | BigInt(low);
}

export function getDebtAdjustmentUsd(
  liqThresholdBps: number,
  supplyUsd: number,
  debtUsd: number,
  targetLiqUtilizationRateBps: number,
  adjustmentFeeBps?: number
) {
  const adjustmentFee =
    adjustmentFeeBps && adjustmentFeeBps > 0 ? fromBps(adjustmentFeeBps) : 0;
  const liqThreshold = fromBps(liqThresholdBps);
  const targetLiqUtilizationRate = fromBps(targetLiqUtilizationRateBps);

  const debtAdjustmentUsd =
    (targetLiqUtilizationRate * supplyUsd * liqThreshold - debtUsd) /
    (1 - targetLiqUtilizationRate * (1 - adjustmentFee) * liqThreshold);
  return debtAdjustmentUsd;
}

export function getSolautoFeesBps(
  isReferred: boolean,
  targetLiqUtilizationRateBps: number | undefined,
  positionNetWorthUsd: number,
  rebalanceDirection: RebalanceDirection
): {
  solauto: number;
  referrer: number;
  total: number;
} {
  const minSize = 10_000; // Minimum position size
  const maxSize = 500_000; // Maximum position size
  const maxFeeBps = 200; // Fee in basis points for minSize (2%)
  const minFeeBps = 50; // Fee in basis points for maxSize (0.5%)
  const k = 1.5;

  if (
    targetLiqUtilizationRateBps !== undefined &&
    targetLiqUtilizationRateBps === 0
  ) {
    return {
      solauto: 0,
      referrer: 0,
      total: 0,
    };
  }

  let feeBps: number = 0;

  if (
    targetLiqUtilizationRateBps !== undefined ||
    rebalanceDirection === RebalanceDirection.Repay
  ) {
    feeBps = 25;
  } else if (positionNetWorthUsd <= minSize) {
    feeBps = maxFeeBps;
  } else if (positionNetWorthUsd >= maxSize) {
    feeBps = minFeeBps;
  } else {
    const t =
      (Math.log(positionNetWorthUsd) - Math.log(minSize)) /
      (Math.log(maxSize) - Math.log(minSize));
    feeBps = Math.round(
      minFeeBps + (maxFeeBps - minFeeBps) * (1 - Math.pow(t, k))
    );
  }

  let referrer = 0;
  if (isReferred) {
    referrer = Math.floor(feeBps / 5);
  }

  return {
    solauto: feeBps - referrer,
    referrer,
    total: feeBps,
  };
}

export function getMaxLiqUtilizationRateBps(
  maxLtvBps: number,
  liqThresholdBps: number,
  offsetFromMaxLtv: number
): number {
  return (
    toBps((fromBps(maxLtvBps) - offsetFromMaxLtv) / fromBps(liqThresholdBps)) -
    1
  ); // -1 to account for any rounding issues
}

export function maxRepayFromBps(maxLtvBps: number, liqThresholdBps: number) {
  return Math.min(
    9000,
    getMaxLiqUtilizationRateBps(maxLtvBps, liqThresholdBps - 1000, 0.01)
  );
}

export function maxRepayToBps(maxLtvBps: number, liqThresholdBps: number) {
  return Math.min(
    maxRepayFromBps(maxLtvBps, liqThresholdBps) - MIN_REPAY_GAP_BPS,
    getMaxLiqUtilizationRateBps(maxLtvBps, liqThresholdBps, 0.01)
  );
}

export function maxBoostToBps(maxLtvBps: number, liqThresholdBps: number) {
  return Math.min(
    maxRepayToBps(maxLtvBps, liqThresholdBps),
    getMaxLiqUtilizationRateBps(maxLtvBps, liqThresholdBps, 0.01)
  );
}
