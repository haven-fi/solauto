export declare function getLiqUtilzationRateBps(supplyUsd: number, debtUsd: number, liqThresholdBps: number): number;
export declare function toBaseUnit(value: number, decimals: number): bigint;
export declare function fromBaseUnit(value: bigint, decimals: number): number;
export declare function fromBps(value: number): number;
export declare function toBps(value: number): number;
export declare function bytesToI80F48(bytes: number[]): number;
export declare function uint8ArrayToBigInt(uint8Array: Uint8Array): bigint;
export declare function getDebtAdjustmentUsd(liqThresholdBps: number, supplyUsd: number, debtUsd: number, targetLiqUtilizationRateBps: number, adjustmentFeeBps?: number): number;
export declare function getMaxLiqUtilizationRate(maxLtvBps: number, liqThresholdBps: number): number;
export declare function maxRepayFrom(maxLtvBps: number, liqThresholdBps: number): number;
export declare function maxRepayTo(maxLtvBps: number, liqThresholdBps: number): number;
//# sourceMappingURL=numberUtils.d.ts.map