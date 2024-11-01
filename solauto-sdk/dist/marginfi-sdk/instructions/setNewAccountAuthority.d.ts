/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */
import { Context, Pda, PublicKey, Signer, TransactionBuilder } from '@metaplex-foundation/umi';
import { Serializer } from '@metaplex-foundation/umi/serializers';
export type SetNewAccountAuthorityInstructionAccounts = {
    marginfiAccount: PublicKey | Pda;
    marginfiGroup: PublicKey | Pda;
    signer: Signer;
    newAuthority: PublicKey | Pda;
    feePayer?: Signer;
};
export type SetNewAccountAuthorityInstructionData = {
    discriminator: Array<number>;
};
export type SetNewAccountAuthorityInstructionDataArgs = {};
export declare function getSetNewAccountAuthorityInstructionDataSerializer(): Serializer<SetNewAccountAuthorityInstructionDataArgs, SetNewAccountAuthorityInstructionData>;
export declare function setNewAccountAuthority(context: Pick<Context, 'payer' | 'programs'>, input: SetNewAccountAuthorityInstructionAccounts): TransactionBuilder;
//# sourceMappingURL=setNewAccountAuthority.d.ts.map