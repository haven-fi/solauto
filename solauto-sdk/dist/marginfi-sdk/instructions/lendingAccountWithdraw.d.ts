/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */
import { Context, Option, OptionOrNullable, Pda, PublicKey, Signer, TransactionBuilder } from '@metaplex-foundation/umi';
import { Serializer } from '@metaplex-foundation/umi/serializers';
export type LendingAccountWithdrawInstructionAccounts = {
    marginfiGroup: PublicKey | Pda;
    marginfiAccount: PublicKey | Pda;
    signer: Signer;
    bank: PublicKey | Pda;
    destinationTokenAccount: PublicKey | Pda;
    bankLiquidityVaultAuthority: PublicKey | Pda;
    bankLiquidityVault: PublicKey | Pda;
    tokenProgram?: PublicKey | Pda;
};
export type LendingAccountWithdrawInstructionData = {
    discriminator: Array<number>;
    amount: bigint;
    withdrawAll: Option<boolean>;
};
export type LendingAccountWithdrawInstructionDataArgs = {
    amount: number | bigint;
    withdrawAll: OptionOrNullable<boolean>;
};
export declare function getLendingAccountWithdrawInstructionDataSerializer(): Serializer<LendingAccountWithdrawInstructionDataArgs, LendingAccountWithdrawInstructionData>;
export type LendingAccountWithdrawInstructionArgs = LendingAccountWithdrawInstructionDataArgs;
export declare function lendingAccountWithdraw(context: Pick<Context, 'programs'>, input: LendingAccountWithdrawInstructionAccounts & LendingAccountWithdrawInstructionArgs): TransactionBuilder;
//# sourceMappingURL=lendingAccountWithdraw.d.ts.map