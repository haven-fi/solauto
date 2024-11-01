/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */
import { Serializer } from '@metaplex-foundation/umi/serializers';
import { SolautoRebalanceType, SolautoRebalanceTypeArgs } from '.';
export type RebalanceData = {
    rebalanceType: SolautoRebalanceType;
    padding1: Array<number>;
    priceSlippageBps: number;
    targetLiqUtilizationRateBps: number;
    padding2: Array<number>;
    flashLoanAmount: bigint;
    padding: Uint8Array;
};
export type RebalanceDataArgs = {
    rebalanceType: SolautoRebalanceTypeArgs;
    padding1: Array<number>;
    priceSlippageBps: number;
    targetLiqUtilizationRateBps: number;
    padding2: Array<number>;
    flashLoanAmount: number | bigint;
    padding: Uint8Array;
};
export declare function getRebalanceDataSerializer(): Serializer<RebalanceDataArgs, RebalanceData>;
//# sourceMappingURL=rebalanceData.d.ts.map