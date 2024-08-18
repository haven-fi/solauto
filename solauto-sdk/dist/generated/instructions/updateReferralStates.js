"use strict";
/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUpdateReferralStatesInstructionDataSerializer = getUpdateReferralStatesInstructionDataSerializer;
exports.updateReferralStates = updateReferralStates;
const umi_1 = require("@metaplex-foundation/umi");
const serializers_1 = require("@metaplex-foundation/umi/serializers");
const shared_1 = require("../shared");
function getUpdateReferralStatesInstructionDataSerializer() {
    return (0, serializers_1.mapSerializer)((0, serializers_1.struct)([
        ['discriminator', (0, serializers_1.u8)()],
        ['referralFeesDestMint', (0, serializers_1.option)((0, serializers_1.publicKey)())],
        ['addressLookupTable', (0, serializers_1.option)((0, serializers_1.publicKey)())],
    ], { description: 'UpdateReferralStatesInstructionData' }), (value) => ({ ...value, discriminator: 0 }));
}
// Instruction.
function updateReferralStates(context, input) {
    // Program ID.
    const programId = context.programs.getPublicKey('solauto', 'AutoyKBRaHSBHy9RsmXCZMy6nNFAg5FYijrvZyQcNLV');
    // Accounts.
    const resolvedAccounts = {
        signer: {
            index: 0,
            isWritable: false,
            value: input.signer ?? null,
        },
        systemProgram: {
            index: 1,
            isWritable: false,
            value: input.systemProgram ?? null,
        },
        rent: { index: 2, isWritable: false, value: input.rent ?? null },
        signerReferralState: {
            index: 3,
            isWritable: true,
            value: input.signerReferralState ?? null,
        },
        referredByState: {
            index: 4,
            isWritable: true,
            value: input.referredByState ?? null,
        },
        referredByAuthority: {
            index: 5,
            isWritable: false,
            value: input.referredByAuthority ?? null,
        },
    };
    // Arguments.
    const resolvedArgs = { ...input };
    // Default values.
    if (!resolvedAccounts.systemProgram.value) {
        resolvedAccounts.systemProgram.value = context.programs.getPublicKey('splSystem', '11111111111111111111111111111111');
        resolvedAccounts.systemProgram.isWritable = false;
    }
    if (!resolvedAccounts.rent.value) {
        resolvedAccounts.rent.value = (0, umi_1.publicKey)('SysvarRent111111111111111111111111111111111');
    }
    // Accounts in order.
    const orderedAccounts = Object.values(resolvedAccounts).sort((a, b) => a.index - b.index);
    // Keys and Signers.
    const [keys, signers] = (0, shared_1.getAccountMetasAndSigners)(orderedAccounts, 'programId', programId);
    // Data.
    const data = getUpdateReferralStatesInstructionDataSerializer().serialize(resolvedArgs);
    // Bytes Created On Chain.
    const bytesCreatedOnChain = 0;
    return (0, umi_1.transactionBuilder)([
        { instruction: { keys, programId, data }, signers, bytesCreatedOnChain },
    ]);
}