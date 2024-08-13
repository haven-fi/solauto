import { MAX_REPAY_GAP_BPS } from "../constants";

export function getLiqUtilzationRateBps(supplyUsd: number, debtUsd: number, liqThresholdBps: number): number {
  if (supplyUsd === 0) {
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
  return value / 10000;
}

export function toBps(value: number): number {
  return Math.round(value * 10000);
}

export function bytesToI80F48(bytes: number[]): number {
  if (bytes.length !== 16) {
    throw new Error('Byte array must be exactly 16 bytes.');
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

  return Number(fullValue) / (2 ** 48);
}

export function uint8ArrayToBigInt(uint8Array: Uint8Array): bigint {
  if (uint8Array.length !== 8) {
    throw new Error('Uint8Array must be exactly 8 bytes long to convert to u64.');
  }

  const buffer = uint8Array.buffer;

  const dataView = new DataView(buffer);

  const low = dataView.getUint32(0, true);
  const high = dataView.getUint32(4, true);

  return BigInt(high) << 32n | BigInt(low);
}

export function getDebtAdjustmentUsd(
  liqThresholdBps: number,
  supplyUsd: number,
  debtUsd: number,
  targetLiqUtilizationRateBps: number,
  adjustmentFeeBps?: number
) {
  const adjustmentFee = adjustmentFeeBps && adjustmentFeeBps > 0 ? fromBps(adjustmentFeeBps) : 0;
  const liqThreshold = fromBps(liqThresholdBps);
  const targetLiqUtilizationRate = fromBps(targetLiqUtilizationRateBps);

  const debtAdjustmentUsd = (targetLiqUtilizationRate * supplyUsd * liqThreshold - debtUsd) / (1 - targetLiqUtilizationRate * (1 - adjustmentFee) * liqThreshold);
  return debtAdjustmentUsd;
}

export function getMaxLiqUtilizationRate(
  maxLtvBps: number,
  liqThresholdBps: number
): number {
  return toBps((fromBps(maxLtvBps) - 0.015) / fromBps(liqThresholdBps)) - 1; // -1 to account for any rounding issues
}

export function maxRepayFrom(maxLtvBps: number, liqThresholdBps: number) {
  return Math.min(
    9000,
    getMaxLiqUtilizationRate(maxLtvBps, liqThresholdBps - 1000)
  );
}

export function maxRepayTo(maxLtvBps: number, liqThresholdBps: number) {
  return Math.min(
    maxRepayFrom(maxLtvBps, liqThresholdBps) - MAX_REPAY_GAP_BPS,
    getMaxLiqUtilizationRate(maxLtvBps, liqThresholdBps)
  );
}