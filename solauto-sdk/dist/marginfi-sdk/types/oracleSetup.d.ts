/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */
import { Serializer } from '@metaplex-foundation/umi/serializers';
export declare enum OracleSetup {
    None = 0,
    PythLegacy = 1,
    SwitchboardLegacy = 2,
    PythPushOracle = 3,
    SwitchboardPull = 4
}
export type OracleSetupArgs = OracleSetup;
export declare function getOracleSetupSerializer(): Serializer<OracleSetupArgs, OracleSetup>;
//# sourceMappingURL=oracleSetup.d.ts.map