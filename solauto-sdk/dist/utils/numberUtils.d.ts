import { RebalanceDirection } from "../generated";
export declare function getLiqUtilzationRateBps(supplyUsd: number, debtUsd: number, liqThresholdBps: number): number;
export declare function toBaseUnit(value: number, decimals: number): bigint;
export declare function fromBaseUnit(value: bigint, decimals: number): number;
export declare function fromBps(value: number): number;
export declare function toBps(value: number): number;
export declare function bytesToI80F48(bytes: number[]): number;
export declare function uint8ArrayToBigInt(uint8Array: Uint8Array): bigint;
export declare function getDebtAdjustmentUsd(liqThresholdBps: number, supplyUsd: number, debtUsd: number, targetLiqUtilizationRateBps: number, adjustmentFeeBps?: number): number;
export declare function getSolautoFeesBps(isReferred: boolean, targetLiqUtilizationRateBps: number | undefined, positionNetWorthUsd: number, rebalanceDirection: RebalanceDirection): {
    solauto: number;
    referrer: number;
    total: number;
};
export declare function getMaxLiqUtilizationRateBps(maxLtvBps: number, liqThresholdBps: number, offsetFromMaxLtv: number): number;
export declare function maxRepayFromBps(maxLtvBps: number, liqThresholdBps: number): number;
export declare function maxRepayToBps(maxLtvBps: number, liqThresholdBps: number): number;
export declare function maxBoostToBps(maxLtvBps: number, liqThresholdBps: number): number;
//# sourceMappingURL=numberUtils.d.ts.map