/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */
import { Context, Pda, PublicKey, TransactionBuilder } from '@metaplex-foundation/umi';
import { Serializer } from '@metaplex-foundation/umi/serializers';
export type LendingAccountSettleEmissionsInstructionAccounts = {
    marginfiAccount: PublicKey | Pda;
    bank: PublicKey | Pda;
};
export type LendingAccountSettleEmissionsInstructionData = {
    discriminator: Array<number>;
};
export type LendingAccountSettleEmissionsInstructionDataArgs = {};
export declare function getLendingAccountSettleEmissionsInstructionDataSerializer(): Serializer<LendingAccountSettleEmissionsInstructionDataArgs, LendingAccountSettleEmissionsInstructionData>;
export declare function lendingAccountSettleEmissions(context: Pick<Context, 'programs'>, input: LendingAccountSettleEmissionsInstructionAccounts): TransactionBuilder;
//# sourceMappingURL=lendingAccountSettleEmissions.d.ts.map