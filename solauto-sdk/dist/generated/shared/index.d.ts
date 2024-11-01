/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */
import { AccountMeta, Pda, PublicKey, Signer } from '@metaplex-foundation/umi';
/**
 * Transforms the given object such that the given keys are optional.
 * @internal
 */
export type PickPartial<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
/**
 * Asserts that the given value is not null or undefined.
 * @internal
 */
export declare function expectSome<T>(value: T | null | undefined): T;
/**
 * Asserts that the given value is a PublicKey.
 * @internal
 */
export declare function expectPublicKey(value: PublicKey | Pda | Signer | null | undefined): PublicKey;
/**
 * Asserts that the given value is a PDA.
 * @internal
 */
export declare function expectPda(value: PublicKey | Pda | Signer | null | undefined): Pda;
/**
 * Defines an instruction account to resolve.
 * @internal
 */
export type ResolvedAccount<T = PublicKey | Pda | Signer | null> = {
    isWritable: boolean;
    value: T;
};
/**
 * Defines a set of instruction account to resolve.
 * @internal
 */
export type ResolvedAccounts = Record<string, ResolvedAccount>;
/**
 * Defines a set of instruction account to resolve with their indices.
 * @internal
 */
export type ResolvedAccountsWithIndices = Record<string, ResolvedAccount & {
    index: number;
}>;
/**
 * Get account metas and signers from resolved accounts.
 * @internal
 */
export declare function getAccountMetasAndSigners(accounts: ResolvedAccount[], optionalAccountStrategy: 'omitted' | 'programId', programId: PublicKey): [AccountMeta[], Signer[]];
//# sourceMappingURL=index.d.ts.map