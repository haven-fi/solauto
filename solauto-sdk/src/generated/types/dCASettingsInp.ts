/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */

import { Serializer, struct, u64 } from '@metaplex-foundation/umi/serializers';
import {
  AutomationSettingsInp,
  AutomationSettingsInpArgs,
  TokenType,
  TokenTypeArgs,
  getAutomationSettingsInpSerializer,
  getTokenTypeSerializer,
} from '.';

export type DCASettingsInp = {
  automation: AutomationSettingsInp;
  dcaInBaseUnit: bigint;
  tokenType: TokenType;
};

export type DCASettingsInpArgs = {
  automation: AutomationSettingsInpArgs;
  dcaInBaseUnit: number | bigint;
  tokenType: TokenTypeArgs;
};

export function getDCASettingsInpSerializer(): Serializer<
  DCASettingsInpArgs,
  DCASettingsInp
> {
  return struct<DCASettingsInp>(
    [
      ['automation', getAutomationSettingsInpSerializer()],
      ['dcaInBaseUnit', u64()],
      ['tokenType', getTokenTypeSerializer()],
    ],
    { description: 'DCASettingsInp' }
  ) as Serializer<DCASettingsInpArgs, DCASettingsInp>;
}
