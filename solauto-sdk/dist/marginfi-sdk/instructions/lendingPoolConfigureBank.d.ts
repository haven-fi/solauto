/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */
import { Context, Option, OptionOrNullable, Pda, PublicKey, Signer, TransactionBuilder } from '@metaplex-foundation/umi';
import { Serializer } from '@metaplex-foundation/umi/serializers';
import { BankOperationalState, BankOperationalStateArgs, InterestRateConfigOpt, InterestRateConfigOptArgs, OracleConfig, OracleConfigArgs, RiskTier, RiskTierArgs, WrappedI80F48, WrappedI80F48Args } from '../types';
export type LendingPoolConfigureBankInstructionAccounts = {
    marginfiGroup: PublicKey | Pda;
    admin: Signer;
    bank: PublicKey | Pda;
};
export type LendingPoolConfigureBankInstructionData = {
    discriminator: Array<number>;
    assetWeightInit: Option<WrappedI80F48>;
    assetWeightMaint: Option<WrappedI80F48>;
    liabilityWeightInit: Option<WrappedI80F48>;
    liabilityWeightMaint: Option<WrappedI80F48>;
    depositLimit: Option<bigint>;
    borrowLimit: Option<bigint>;
    operationalState: Option<BankOperationalState>;
    oracle: Option<OracleConfig>;
    interestRateConfig: Option<InterestRateConfigOpt>;
    riskTier: Option<RiskTier>;
    totalAssetValueInitLimit: Option<bigint>;
};
export type LendingPoolConfigureBankInstructionDataArgs = {
    assetWeightInit: OptionOrNullable<WrappedI80F48Args>;
    assetWeightMaint: OptionOrNullable<WrappedI80F48Args>;
    liabilityWeightInit: OptionOrNullable<WrappedI80F48Args>;
    liabilityWeightMaint: OptionOrNullable<WrappedI80F48Args>;
    depositLimit: OptionOrNullable<number | bigint>;
    borrowLimit: OptionOrNullable<number | bigint>;
    operationalState: OptionOrNullable<BankOperationalStateArgs>;
    oracle: OptionOrNullable<OracleConfigArgs>;
    interestRateConfig: OptionOrNullable<InterestRateConfigOptArgs>;
    riskTier: OptionOrNullable<RiskTierArgs>;
    totalAssetValueInitLimit: OptionOrNullable<number | bigint>;
};
export declare function getLendingPoolConfigureBankInstructionDataSerializer(): Serializer<LendingPoolConfigureBankInstructionDataArgs, LendingPoolConfigureBankInstructionData>;
export type LendingPoolConfigureBankInstructionArgs = LendingPoolConfigureBankInstructionDataArgs;
export declare function lendingPoolConfigureBank(context: Pick<Context, 'programs'>, input: LendingPoolConfigureBankInstructionAccounts & LendingPoolConfigureBankInstructionArgs): TransactionBuilder;
//# sourceMappingURL=lendingPoolConfigureBank.d.ts.map