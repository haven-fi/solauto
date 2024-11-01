"use strict";
/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLendingPoolAddBankInstructionDataSerializer = getLendingPoolAddBankInstructionDataSerializer;
exports.lendingPoolAddBank = lendingPoolAddBank;
const umi_1 = require("@metaplex-foundation/umi");
const serializers_1 = require("@metaplex-foundation/umi/serializers");
const shared_1 = require("../shared");
const types_1 = require("../types");
function getLendingPoolAddBankInstructionDataSerializer() {
    return (0, serializers_1.mapSerializer)((0, serializers_1.struct)([
        ['discriminator', (0, serializers_1.array)((0, serializers_1.u8)(), { size: 8 })],
        ['bankConfig', (0, types_1.getBankConfigCompactSerializer)()],
    ], { description: 'LendingPoolAddBankInstructionData' }), (value) => ({
        ...value,
        discriminator: [215, 68, 72, 78, 208, 218, 103, 182],
    }));
}
// Instruction.
function lendingPoolAddBank(context, input) {
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
            isWritable: true,
            value: input.admin ?? null,
        },
        feePayer: {
            index: 2,
            isWritable: true,
            value: input.feePayer ?? null,
        },
        bankMint: {
            index: 3,
            isWritable: false,
            value: input.bankMint ?? null,
        },
        bank: { index: 4, isWritable: true, value: input.bank ?? null },
        liquidityVaultAuthority: {
            index: 5,
            isWritable: false,
            value: input.liquidityVaultAuthority ?? null,
        },
        liquidityVault: {
            index: 6,
            isWritable: true,
            value: input.liquidityVault ?? null,
        },
        insuranceVaultAuthority: {
            index: 7,
            isWritable: false,
            value: input.insuranceVaultAuthority ?? null,
        },
        insuranceVault: {
            index: 8,
            isWritable: true,
            value: input.insuranceVault ?? null,
        },
        feeVaultAuthority: {
            index: 9,
            isWritable: false,
            value: input.feeVaultAuthority ?? null,
        },
        feeVault: {
            index: 10,
            isWritable: true,
            value: input.feeVault ?? null,
        },
        rent: {
            index: 11,
            isWritable: false,
            value: input.rent ?? null,
        },
        tokenProgram: {
            index: 12,
            isWritable: false,
            value: input.tokenProgram ?? null,
        },
        systemProgram: {
            index: 13,
            isWritable: false,
            value: input.systemProgram ?? null,
        },
    };
    // Arguments.
    const resolvedArgs = { ...input };
    // Default values.
    if (!resolvedAccounts.feePayer.value) {
        resolvedAccounts.feePayer.value = context.payer;
    }
    if (!resolvedAccounts.rent.value) {
        resolvedAccounts.rent.value = (0, umi_1.publicKey)('SysvarRent111111111111111111111111111111111');
    }
    if (!resolvedAccounts.tokenProgram.value) {
        resolvedAccounts.tokenProgram.value = context.programs.getPublicKey('splToken', 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
        resolvedAccounts.tokenProgram.isWritable = false;
    }
    if (!resolvedAccounts.systemProgram.value) {
        resolvedAccounts.systemProgram.value = context.programs.getPublicKey('splSystem', '11111111111111111111111111111111');
        resolvedAccounts.systemProgram.isWritable = false;
    }
    // Accounts in order.
    const orderedAccounts = Object.values(resolvedAccounts).sort((a, b) => a.index - b.index);
    // Keys and Signers.
    const [keys, signers] = (0, shared_1.getAccountMetasAndSigners)(orderedAccounts, 'programId', programId);
    // Data.
    const data = getLendingPoolAddBankInstructionDataSerializer().serialize(resolvedArgs);
    // Bytes Created On Chain.
    const bytesCreatedOnChain = 0;
    return (0, umi_1.transactionBuilder)([
        { instruction: { keys, programId, data }, signers, bytesCreatedOnChain },
    ]);
}
