"use strict";
/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLendingPoolConfigureBankInstructionDataSerializer = getLendingPoolConfigureBankInstructionDataSerializer;
exports.lendingPoolConfigureBank = lendingPoolConfigureBank;
const umi_1 = require("@metaplex-foundation/umi");
const serializers_1 = require("@metaplex-foundation/umi/serializers");
const shared_1 = require("../shared");
const types_1 = require("../types");
function getLendingPoolConfigureBankInstructionDataSerializer() {
    return (0, serializers_1.mapSerializer)((0, serializers_1.struct)([
        ['discriminator', (0, serializers_1.array)((0, serializers_1.u8)(), { size: 8 })],
        ['assetWeightInit', (0, serializers_1.option)((0, types_1.getWrappedI80F48Serializer)())],
        ['assetWeightMaint', (0, serializers_1.option)((0, types_1.getWrappedI80F48Serializer)())],
        ['liabilityWeightInit', (0, serializers_1.option)((0, types_1.getWrappedI80F48Serializer)())],
        ['liabilityWeightMaint', (0, serializers_1.option)((0, types_1.getWrappedI80F48Serializer)())],
        ['depositLimit', (0, serializers_1.option)((0, serializers_1.u64)())],
        ['borrowLimit', (0, serializers_1.option)((0, serializers_1.u64)())],
        ['operationalState', (0, serializers_1.option)((0, types_1.getBankOperationalStateSerializer)())],
        ['oracle', (0, serializers_1.option)((0, types_1.getOracleConfigSerializer)())],
        ['interestRateConfig', (0, serializers_1.option)((0, types_1.getInterestRateConfigOptSerializer)())],
        ['riskTier', (0, serializers_1.option)((0, types_1.getRiskTierSerializer)())],
        ['totalAssetValueInitLimit', (0, serializers_1.option)((0, serializers_1.u64)())],
    ], { description: 'LendingPoolConfigureBankInstructionData' }), (value) => ({
        ...value,
        discriminator: [121, 173, 156, 40, 93, 148, 56, 237],
    }));
}
// Instruction.
function lendingPoolConfigureBank(context, input) {
    // Program ID.
    const programId = context.programs.getPublicKey('marginfi', 'MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA');
    // Accounts.
    const resolvedAccounts = {
        marginfiGroup: {
            index: 0,
            isWritable: false,
            value: input.marginfiGroup ?? null,
        },
        admin: {
            index: 1,
            isWritable: false,
            value: input.admin ?? null,
        },
        bank: { index: 2, isWritable: true, value: input.bank ?? null },
    };
    // Arguments.
    const resolvedArgs = { ...input };
    // Accounts in order.
    const orderedAccounts = Object.values(resolvedAccounts).sort((a, b) => a.index - b.index);
    // Keys and Signers.
    const [keys, signers] = (0, shared_1.getAccountMetasAndSigners)(orderedAccounts, 'programId', programId);
    // Data.
    const data = getLendingPoolConfigureBankInstructionDataSerializer().serialize(resolvedArgs);
    // Bytes Created On Chain.
    const bytesCreatedOnChain = 0;
    return (0, umi_1.transactionBuilder)([
        { instruction: { keys, programId, data }, signers, bytesCreatedOnChain },
    ]);
}
