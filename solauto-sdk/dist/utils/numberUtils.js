"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLiqUtilzationRateBps = getLiqUtilzationRateBps;
exports.toBaseUnit = toBaseUnit;
exports.fromBaseUnit = fromBaseUnit;
exports.fromBps = fromBps;
exports.toBps = toBps;
exports.bytesToI80F48 = bytesToI80F48;
exports.uint8ArrayToBigInt = uint8ArrayToBigInt;
exports.getDebtAdjustmentUsd = getDebtAdjustmentUsd;
exports.getMaxLiqUtilizationRate = getMaxLiqUtilizationRate;
exports.maxRepayFrom = maxRepayFrom;
exports.maxRepayTo = maxRepayTo;
const constants_1 = require("../constants");
function getLiqUtilzationRateBps(supplyUsd, debtUsd, liqThresholdBps) {
    if (supplyUsd === 0) {
        return 0;
    }
    return toBps(debtUsd / (supplyUsd * fromBps(liqThresholdBps)));
}
function toBaseUnit(value, decimals) {
    return BigInt(Math.round(value * Math.pow(10, decimals)));
}
function fromBaseUnit(value, decimals) {
    return Number(value) / Math.pow(10, decimals);
}
function fromBps(value) {
    return value / 10000;
}
function toBps(value) {
    return Math.round(value * 10000);
}
function bytesToI80F48(bytes) {
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
function uint8ArrayToBigInt(uint8Array) {
    if (uint8Array.length !== 8) {
        throw new Error('Uint8Array must be exactly 8 bytes long to convert to u64.');
    }
    const buffer = uint8Array.buffer;
    const dataView = new DataView(buffer);
    const low = dataView.getUint32(0, true);
    const high = dataView.getUint32(4, true);
    return BigInt(high) << 32n | BigInt(low);
}
function getDebtAdjustmentUsd(liqThresholdBps, supplyUsd, debtUsd, targetLiqUtilizationRateBps, adjustmentFeeBps) {
    const adjustmentFee = adjustmentFeeBps && adjustmentFeeBps > 0 ? fromBps(adjustmentFeeBps) : 0;
    const liqThreshold = fromBps(liqThresholdBps);
    const targetLiqUtilizationRate = fromBps(targetLiqUtilizationRateBps);
    const debtAdjustmentUsd = (targetLiqUtilizationRate * supplyUsd * liqThreshold - debtUsd) / (1 - targetLiqUtilizationRate * (1 - adjustmentFee) * liqThreshold);
    return debtAdjustmentUsd;
}
function getMaxLiqUtilizationRate(maxLtvBps, liqThresholdBps) {
    return toBps((fromBps(maxLtvBps) - 0.015) / fromBps(liqThresholdBps)) - 1; // -1 to account for any rounding issues
}
function maxRepayFrom(maxLtvBps, liqThresholdBps) {
    return Math.min(9000, getMaxLiqUtilizationRate(maxLtvBps, liqThresholdBps - 1000));
}
function maxRepayTo(maxLtvBps, liqThresholdBps) {
    return Math.min(maxRepayFrom(maxLtvBps, liqThresholdBps) - constants_1.MAX_REPAY_GAP_BPS, getMaxLiqUtilizationRate(maxLtvBps, liqThresholdBps));
}
