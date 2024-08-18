import { PublicKey } from "@solana/web3.js";
import { Umi } from "@metaplex-foundation/umi";
import { AutomationSettings, DCASettings, DCASettingsInpArgs, FeeType, LendingPlatform, PositionState, SolautoSettingsParameters, SolautoSettingsParametersInpArgs } from "../../generated";
import { RebalanceAction, SolautoPositionDetails } from "../../types/solauto";
export declare function nextAutomationPeriodTimestamp(automation: AutomationSettings): number;
export declare function eligibleForNextAutomationPeriod(automation: AutomationSettings, currentUnixTime: number): boolean;
export declare function getUpdatedValueFromAutomation(currValue: number, targetValue: number, automation: AutomationSettings, currentUnixTimestamp: number): number;
export declare function getAdjustedSettingsFromAutomation(settings: SolautoSettingsParameters, currentUnixTime: number): SolautoSettingsParameters;
export declare function getSolautoFeesBps(isReferred: boolean, feeType: FeeType): {
    solauto: number;
    referrer: number;
    total: number;
};
export declare function eligibleForRebalance(positionState: PositionState, positionSettings: SolautoSettingsParameters, positionDca: DCASettings, currentUnixSecs: number): RebalanceAction | undefined;
export declare function eligibleForRefresh(positionState: PositionState, positionSettings: SolautoSettingsParameters, currentUnixTime: number): boolean;
export declare function getSolautoManagedPositions(umi: Umi, authority?: PublicKey): Promise<SolautoPositionDetails[]>;
export declare function getAllReferralStates(umi: Umi): Promise<PublicKey[]>;
export declare function getReferralsByUser(umi: Umi, user: PublicKey): Promise<PublicKey[]>;
export declare function getAllPositionsByAuthority(umi: Umi, user: PublicKey): Promise<SolautoPositionDetails[]>;
interface GetLatestStateProps {
    state: PositionState;
    umi?: Umi;
    protocolAccount?: PublicKey;
    lendingPlatform?: LendingPlatform;
    supplyPrice?: number;
    debtPrice?: number;
}
export declare function positionStateWithPrices({ state, supplyPrice, debtPrice, umi, protocolAccount, lendingPlatform, }: GetLatestStateProps): Promise<PositionState | undefined>;
interface AssetProps {
    amountUsedBaseUnit: bigint;
    decimals: number;
    price: number;
    mint: PublicKey;
}
export declare function createFakePositionState(supply: AssetProps, debt: AssetProps, maxLtvBps: number, liqThresholdBps: number): PositionState;
type PositionAdjustment = {
    type: "supply";
    value: bigint;
} | {
    type: "debt";
    value: bigint;
} | {
    type: "debtDcaIn";
    value: bigint;
} | {
    type: "settings";
    value: SolautoSettingsParametersInpArgs;
} | {
    type: "dca";
    value: DCASettingsInpArgs;
};
export declare class LivePositionUpdates {
    supplyAdjustment: bigint;
    debtAdjustment: bigint;
    debtTaBalanceAdjustment: bigint;
    settings: SolautoSettingsParameters | undefined;
    activeDca: DCASettings | undefined;
    new(update: PositionAdjustment): void;
    reset(): void;
    hasUpdates(): boolean;
}
export {};
//# sourceMappingURL=generalUtils.d.ts.map