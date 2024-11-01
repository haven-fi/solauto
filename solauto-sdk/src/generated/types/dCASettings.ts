/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */

import {
  Serializer,
  bytes,
  struct,
  u64,
} from '@metaplex-foundation/umi/serializers';
import {
  AutomationSettings,
  AutomationSettingsArgs,
  getAutomationSettingsSerializer,
} from '.';

export type DCASettings = {
  automation: AutomationSettings;
  debtToAddBaseUnit: bigint;
  padding: Uint8Array;
};

export type DCASettingsArgs = {
  automation: AutomationSettingsArgs;
  debtToAddBaseUnit: number | bigint;
  padding: Uint8Array;
};

export function getDCASettingsSerializer(): Serializer<
  DCASettingsArgs,
  DCASettings
> {
  return struct<DCASettings>(
    [
      ['automation', getAutomationSettingsSerializer()],
      ['debtToAddBaseUnit', u64()],
      ['padding', bytes({ size: 32 })],
    ],
    { description: 'DCASettings' }
  ) as Serializer<DCASettingsArgs, DCASettings>;
}
