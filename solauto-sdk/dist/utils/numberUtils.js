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
exports.getSolautoFeesBps = getSolautoFeesBps;
exports.getMaxLiqUtilizationRateBps = getMaxLiqUtilizationRateBps;
exports.maxRepayFromBps = maxRepayFromBps;
exports.maxRepayToBps = maxRepayToBps;
exports.maxBoostToBps = maxBoostToBps;
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
    return value / constants_1.BASIS_POINTS;
}
function toBps(value) {
    return Math.round(value * constants_1.BASIS_POINTS);
}
function bytesToI80F48(bytes) {
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
function uint8ArrayToBigInt(uint8Array) {
    if (uint8Array.length !== 8) {
        throw new Error("Uint8Array must be exactly 8 bytes long to convert to u64.");
    }
    const buffer = uint8Array.buffer;
    const dataView = new DataView(buffer);
    const low = dataView.getUint32(0, true);
    const high = dataView.getUint32(4, true);
    return (BigInt(high) << 32n) | BigInt(low);
}
function getDebtAdjustmentUsd(liqThresholdBps, supplyUsd, debtUsd, targetLiqUtilizationRateBps, adjustmentFeeBps) {
    const adjustmentFee = adjustmentFeeBps && adjustmentFeeBps > 0 ? fromBps(adjustmentFeeBps) : 0;
    const liqThreshold = fromBps(liqThresholdBps);
    const targetLiqUtilizationRate = fromBps(targetLiqUtilizationRateBps);
    const debtAdjustmentUsd = (targetLiqUtilizationRate * supplyUsd * liqThreshold - debtUsd) /
        (1 - targetLiqUtilizationRate * (1 - adjustmentFee) * liqThreshold);
    return debtAdjustmentUsd;
}
function getSolautoFeesBps(isReferred, targetLiqUtilizationRateBps, positionNetWorthUsd) {
    const minSize = 10000; // Minimum position size
    const maxSize = 500000; // Maximum position size
    const maxFeeBps = 200; // Fee in basis points for minSize (2%)
    const minFeeBps = 50; // Fee in basis points for maxSize (0.5%)
    const k = 1.5;
    let feeBps = 0;
    if (targetLiqUtilizationRateBps !== undefined) {
        feeBps = 25;
    }
    else if (positionNetWorthUsd <= minSize) {
        feeBps = maxFeeBps;
    }
    else if (positionNetWorthUsd >= maxSize) {
        feeBps = minFeeBps;
    }
    else {
        const t = (Math.log(positionNetWorthUsd) - Math.log(minSize)) /
            (Math.log(maxSize) - Math.log(minSize));
        feeBps = Math.round(minFeeBps + (maxFeeBps - minFeeBps) * (1 - Math.pow(t, k)));
    }
    let referrer = 0;
    if (isReferred) {
        referrer = Math.floor(feeBps / 4);
    }
    return {
        solauto: feeBps - referrer,
        referrer,
        total: feeBps,
    };
}
function getMaxLiqUtilizationRateBps(maxLtvBps, liqThresholdBps, offsetFromMaxLtv) {
    return toBps((fromBps(maxLtvBps) - offsetFromMaxLtv) / fromBps(liqThresholdBps)) - 1; // -1 to account for any rounding issues
}
function maxRepayFromBps(maxLtvBps, liqThresholdBps) {
    return Math.min(9000, getMaxLiqUtilizationRateBps(maxLtvBps, liqThresholdBps - 1000, 0.005));
}
function maxRepayToBps(maxLtvBps, liqThresholdBps) {
    return Math.min(maxRepayFromBps(maxLtvBps, liqThresholdBps) - constants_1.MIN_REPAY_GAP_BPS, getMaxLiqUtilizationRateBps(maxLtvBps, liqThresholdBps, 0.005));
}
function maxBoostToBps(maxLtvBps, liqThresholdBps) {
    return Math.min(maxRepayToBps(maxLtvBps, liqThresholdBps), getMaxLiqUtilizationRateBps(maxLtvBps, liqThresholdBps, 0.015));
}
