/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */
import { Account, Context, Pda, PublicKey, RpcAccount, RpcGetAccountOptions, RpcGetAccountsOptions } from '@metaplex-foundation/umi';
import { Serializer } from '@metaplex-foundation/umi/serializers';
import { FeeType, FeeTypeArgs, PodBool, PodBoolArgs, PositionData, PositionDataArgs, PositionState, PositionStateArgs, RebalanceData, RebalanceDataArgs } from '../types';
export type SolautoPosition = Account<SolautoPositionAccountData>;
export type SolautoPositionAccountData = {
    bump: Array<number>;
    positionId: Array<number>;
    selfManaged: PodBool;
    padding1: Array<number>;
    authority: PublicKey;
    position: PositionData;
    state: PositionState;
    rebalance: RebalanceData;
    feeType: FeeType;
    padding2: Array<number>;
    padding: Array<number>;
};
export type SolautoPositionAccountDataArgs = {
    bump: Array<number>;
    positionId: Array<number>;
    selfManaged: PodBoolArgs;
    padding1: Array<number>;
    authority: PublicKey;
    position: PositionDataArgs;
    state: PositionStateArgs;
    rebalance: RebalanceDataArgs;
    feeType: FeeTypeArgs;
    padding2: Array<number>;
    padding: Array<number>;
};
export declare function getSolautoPositionAccountDataSerializer(): Serializer<SolautoPositionAccountDataArgs, SolautoPositionAccountData>;
export declare function deserializeSolautoPosition(rawAccount: RpcAccount): SolautoPosition;
export declare function fetchSolautoPosition(context: Pick<Context, 'rpc'>, publicKey: PublicKey | Pda, options?: RpcGetAccountOptions): Promise<SolautoPosition>;
export declare function safeFetchSolautoPosition(context: Pick<Context, 'rpc'>, publicKey: PublicKey | Pda, options?: RpcGetAccountOptions): Promise<SolautoPosition | null>;
export declare function fetchAllSolautoPosition(context: Pick<Context, 'rpc'>, publicKeys: Array<PublicKey | Pda>, options?: RpcGetAccountsOptions): Promise<SolautoPosition[]>;
export declare function safeFetchAllSolautoPosition(context: Pick<Context, 'rpc'>, publicKeys: Array<PublicKey | Pda>, options?: RpcGetAccountsOptions): Promise<SolautoPosition[]>;
export declare function getSolautoPositionGpaBuilder(context: Pick<Context, 'rpc' | 'programs'>): import("@metaplex-foundation/umi").GpaBuilder<SolautoPosition, {
    bump: Array<number>;
    positionId: Array<number>;
    selfManaged: PodBoolArgs;
    padding1: Array<number>;
    authority: PublicKey;
    position: PositionDataArgs;
    state: PositionStateArgs;
    rebalance: RebalanceDataArgs;
    feeType: FeeTypeArgs;
    padding2: Array<number>;
    padding: Array<number>;
}>;
export declare function getSolautoPositionSize(): number;
//# sourceMappingURL=solautoPosition.d.ts.map