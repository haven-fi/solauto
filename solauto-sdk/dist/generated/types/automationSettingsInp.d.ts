/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */
import { Serializer } from '@metaplex-foundation/umi/serializers';
export type AutomationSettingsInp = {
    targetPeriods: number;
    periodsPassed: number;
    unixStartDate: bigint;
    intervalSeconds: bigint;
};
export type AutomationSettingsInpArgs = {
    targetPeriods: number;
    periodsPassed: number;
    unixStartDate: number | bigint;
    intervalSeconds: number | bigint;
};
export declare function getAutomationSettingsInpSerializer(): Serializer<AutomationSettingsInpArgs, AutomationSettingsInp>;
//# sourceMappingURL=automationSettingsInp.d.ts.map