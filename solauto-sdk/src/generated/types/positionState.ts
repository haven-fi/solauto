/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */

import {
  Serializer,
  array,
  struct,
  u16,
  u32,
  u64,
  u8,
} from '@metaplex-foundation/umi/serializers';
import {
  PositionTokenState,
  PositionTokenStateArgs,
  TokenAmount,
  TokenAmountArgs,
  getPositionTokenStateSerializer,
  getTokenAmountSerializer,
} from '.';

export type PositionState = {
  liqUtilizationRateBps: number;
  padding1: Array<number>;
  netWorth: TokenAmount;
  supply: PositionTokenState;
  debt: PositionTokenState;
  maxLtvBps: number;
  liqThresholdBps: number;
  padding2: Array<number>;
  lastRefreshed: bigint;
  padding: Array<number>;
};

export type PositionStateArgs = {
  liqUtilizationRateBps: number;
  padding1: Array<number>;
  netWorth: TokenAmountArgs;
  supply: PositionTokenStateArgs;
  debt: PositionTokenStateArgs;
  maxLtvBps: number;
  liqThresholdBps: number;
  padding2: Array<number>;
  lastRefreshed: number | bigint;
  padding: Array<number>;
};

export function getPositionStateSerializer(): Serializer<
  PositionStateArgs,
  PositionState
> {
  return struct<PositionState>(
    [
      ['liqUtilizationRateBps', u16()],
      ['padding1', array(u8(), { size: 6 })],
      ['netWorth', getTokenAmountSerializer()],
      ['supply', getPositionTokenStateSerializer()],
      ['debt', getPositionTokenStateSerializer()],
      ['maxLtvBps', u16()],
      ['liqThresholdBps', u16()],
      ['padding2', array(u8(), { size: 4 })],
      ['lastRefreshed', u64()],
      ['padding', array(u32(), { size: 2 })],
    ],
    { description: 'PositionState' }
  ) as Serializer<PositionStateArgs, PositionState>;
}
