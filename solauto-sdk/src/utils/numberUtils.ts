import { PublicKey } from "@solana/web3.js";
import {
  BASIS_POINTS,
  MIN_REPAY_GAP_BPS,
  OFFSET_FROM_MAX_LTV,
  USD_DECIMALS,
} from "../constants";
import { PositionState, PriceType } from "../generated";
import { RoundAction } from "../types";
import { safeGetPrice } from "./priceUtils";
import { StrategyType, strategyType } from "./stringUtils";
import { getDebtAdjustment } from "../services";

export function calcNetWorthUsd(state?: PositionState) {
  return fromRoundedUsdValue(state?.netWorth.baseAmountUsdValue ?? BigInt(0));
}

export function calcSupplyUsd(state?: PositionState) {
  return fromRoundedUsdValue(
    state?.supply.amountUsed.baseAmountUsdValue ?? BigInt(0)
  );
}

export function calcDebtUsd(state?: PositionState) {
  return fromRoundedUsdValue(
    state?.debt.amountUsed.baseAmountUsdValue ?? BigInt(0)
  );
}

export function calcNetWorth(state?: PositionState) {
  return fromBaseUnit(
    state?.netWorth.baseUnit ?? BigInt(0),
    state?.supply.decimals ?? 1
  );
}

export function calcTotalSupply(state?: PositionState) {
  return fromBaseUnit(
    state?.supply.amountUsed.baseUnit ?? BigInt(0),
    state?.supply.decimals ?? 1
  );
}

export function calcTotalDebt(state?: PositionState) {
  return fromBaseUnit(
    state?.debt.amountUsed.baseUnit ?? BigInt(0),
    state?.debt.decimals ?? 1
  );
}

export function debtLiquidityAvailable(state?: PositionState) {
  return fromBaseUnit(
    state?.debt.amountCanBeUsed.baseUnit ?? BigInt(0),
    state?.debt.decimals ?? 1
  );
}

export function debtLiquidityUsdAvailable(state?: PositionState) {
  return fromRoundedUsdValue(
    state?.debt.amountCanBeUsed.baseAmountUsdValue ?? BigInt(0)
  );
}

export function supplyLiquidityDepositable(state?: PositionState) {
  return fromBaseUnit(
    state?.supply.amountCanBeUsed.baseUnit ?? BigInt(0),
    state?.supply.decimals ?? 1
  );
}

export function supplyLiquidityUsdDepositable(state?: PositionState) {
  return fromRoundedUsdValue(
    state?.supply.amountCanBeUsed.baseAmountUsdValue ?? BigInt(0)
  );
}

export function fromRoundedUsdValue(number: bigint) {
  return fromBaseUnit(number, USD_DECIMALS);
}

export function toRoundedUsdValue(number: number) {
  return toBaseUnit(number, USD_DECIMALS);
}

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

export function toBaseUnit(
  value: number,
  decimals: number,
  roundAction: RoundAction = "Round"
): bigint {
  if (!decimals) {
    return BigInt(Math.floor(value));
  }
  return BigInt(roundNumber(value * Math.pow(10, decimals), roundAction));
}

export function fromBaseUnit(value: bigint, decimals: number): number {
  if (!decimals) {
    return Number(value);
  }
  return Number(value) / Math.pow(10, decimals);
}

export function fromBps(value: number): number {
  return value / BASIS_POINTS;
}

export function toBps(
  value: number,
  roundAction: RoundAction = "Round"
): number {
  const bps = value * BASIS_POINTS;
  return roundNumber(bps, roundAction);
}

function roundNumber(number: number, roundAction: RoundAction = "Round") {
  return roundAction === "Round"
    ? Math.round(number)
    : roundAction === "Floor"
      ? Math.floor(number)
      : Math.ceil(number);
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
    getMaxLiqUtilizationRateBps(
      maxLtvBps,
      liqThresholdBps - 1000,
      OFFSET_FROM_MAX_LTV
    )
  );
}

export function maxRepayToBps(maxLtvBps: number, liqThresholdBps: number) {
  return Math.min(
    maxRepayFromBps(maxLtvBps, liqThresholdBps) - MIN_REPAY_GAP_BPS,
    getMaxLiqUtilizationRateBps(maxLtvBps, liqThresholdBps, OFFSET_FROM_MAX_LTV)
  );
}

export function maxBoostToBps(maxLtvBps: number, liqThresholdBps: number) {
  return Math.min(
    maxRepayToBps(maxLtvBps, liqThresholdBps),
    getMaxLiqUtilizationRateBps(maxLtvBps, liqThresholdBps, OFFSET_FROM_MAX_LTV)
  );
}

export function realtimeUsdToEmaUsd(
  realtimeAmountUsd: number,
  mint: PublicKey
) {
  return (
    (realtimeAmountUsd / safeGetPrice(mint, PriceType.Realtime)!) *
    safeGetPrice(mint, PriceType.Ema)!
  );
}

export function boostSettingToLeverageFactor(
  supplyMint: PublicKey,
  debtMint: PublicKey,
  boostToBps: number,
  liqThresholdBps: number
) {
  const strategy = strategyType(supplyMint, debtMint);
  const supplyUsd = 100;
  const debtUsd = getDebtAdjustment(
    liqThresholdBps,
    { supplyUsd: 100, debtUsd: 0 },
    boostToBps
  ).debtAdjustmentUsd;
  return getLeverageFactor(strategy, supplyUsd + debtUsd, debtUsd);
}

export function getLeverageFactor(
  strategyType: StrategyType,
  supplyUsd: number,
  debtUsd: number
): number {
  return (
    (strategyType === "Long" || strategyType === "Ratio"
      ? supplyUsd
      : debtUsd) /
    (supplyUsd - debtUsd)
  );
}
