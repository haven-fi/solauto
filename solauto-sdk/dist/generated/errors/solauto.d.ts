/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */
import { Program, ProgramError } from '@metaplex-foundation/umi';
/** IncorrectAccounts: Missing or incorrect accounts provided for the given instruction */
export declare class IncorrectAccountsError extends ProgramError {
    readonly name: string;
    readonly code: number;
    constructor(program: Program, cause?: Error);
}
/** FailedAccountDeserialization: Failed to deserialize account data, incorrect account was likely given */
export declare class FailedAccountDeserializationError extends ProgramError {
    readonly name: string;
    readonly code: number;
    constructor(program: Program, cause?: Error);
}
/** InvalidPositionSettings: Invalid position settings given */
export declare class InvalidPositionSettingsError extends ProgramError {
    readonly name: string;
    readonly code: number;
    constructor(program: Program, cause?: Error);
}
/** InvalidDCASettings: Invalid DCA settings given */
export declare class InvalidDCASettingsError extends ProgramError {
    readonly name: string;
    readonly code: number;
    constructor(program: Program, cause?: Error);
}
/** InvalidAutomationData: Invalid automation data given */
export declare class InvalidAutomationDataError extends ProgramError {
    readonly name: string;
    readonly code: number;
    constructor(program: Program, cause?: Error);
}
/** StaleProtocolData: Stale protocol data. Refresh instruction must be invoked before taking a protocol action */
export declare class StaleProtocolDataError extends ProgramError {
    readonly name: string;
    readonly code: number;
    constructor(program: Program, cause?: Error);
}
/** UnableToRebalance: Unable to adjust position to the desired utilization rate */
export declare class UnableToRebalanceError extends ProgramError {
    readonly name: string;
    readonly code: number;
    constructor(program: Program, cause?: Error);
}
/** ExceededValidUtilizationRate: Desired action brought the utilization rate to an unsafe amount */
export declare class ExceededValidUtilizationRateError extends ProgramError {
    readonly name: string;
    readonly code: number;
    constructor(program: Program, cause?: Error);
}
/** InvalidRebalanceCondition: Invalid position condition to rebalance */
export declare class InvalidRebalanceConditionError extends ProgramError {
    readonly name: string;
    readonly code: number;
    constructor(program: Program, cause?: Error);
}
/** InstructionIsCPI: Unable to invoke instruction through a CPI */
export declare class InstructionIsCPIError extends ProgramError {
    readonly name: string;
    readonly code: number;
    constructor(program: Program, cause?: Error);
}
/** RebalanceAbuse: Too many rebalance instruction invocations in the same transaction */
export declare class RebalanceAbuseError extends ProgramError {
    readonly name: string;
    readonly code: number;
    constructor(program: Program, cause?: Error);
}
/** IncorrectInstructions: Incorrect set of instructions in the transaction */
export declare class IncorrectInstructionsError extends ProgramError {
    readonly name: string;
    readonly code: number;
    constructor(program: Program, cause?: Error);
}
/**
 * Attempts to resolve a custom program error from the provided error code.
 * @category Errors
 */
export declare function getSolautoErrorFromCode(code: number, program: Program, cause?: Error): ProgramError | null;
/**
 * Attempts to resolve a custom program error from the provided error name, i.e. 'Unauthorized'.
 * @category Errors
 */
export declare function getSolautoErrorFromName(name: string, program: Program, cause?: Error): ProgramError | null;
//# sourceMappingURL=solauto.d.ts.map