/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */

import {
  Context,
  Pda,
  PublicKey,
  Signer,
  TransactionBuilder,
  publicKey,
  transactionBuilder,
} from '@metaplex-foundation/umi';
import {
  Serializer,
  mapSerializer,
  struct,
  u8,
} from '@metaplex-foundation/umi/serializers';
import {
  ResolvedAccount,
  ResolvedAccountsWithIndices,
  getAccountMetasAndSigners,
} from '../shared';

// Accounts.
export type ClaimReferralFeesInstructionAccounts = {
  signer: Signer;
  systemProgram?: PublicKey | Pda;
  tokenProgram?: PublicKey | Pda;
  rent?: PublicKey | Pda;
  referralState: PublicKey | Pda;
  referralFeesTa: PublicKey | Pda;
  referralFeesMint: PublicKey | Pda;
};

// Data.
export type ClaimReferralFeesInstructionData = { discriminator: number };

export type ClaimReferralFeesInstructionDataArgs = {};

export function getClaimReferralFeesInstructionDataSerializer(): Serializer<
  ClaimReferralFeesInstructionDataArgs,
  ClaimReferralFeesInstructionData
> {
  return mapSerializer<
    ClaimReferralFeesInstructionDataArgs,
    any,
    ClaimReferralFeesInstructionData
  >(
    struct<ClaimReferralFeesInstructionData>([['discriminator', u8()]], {
      description: 'ClaimReferralFeesInstructionData',
    }),
    (value) => ({ ...value, discriminator: 1 })
  ) as Serializer<
    ClaimReferralFeesInstructionDataArgs,
    ClaimReferralFeesInstructionData
  >;
}

// Instruction.
export function claimReferralFees(
  context: Pick<Context, 'programs'>,
  input: ClaimReferralFeesInstructionAccounts
): TransactionBuilder {
  // Program ID.
  const programId = context.programs.getPublicKey(
    'solauto',
    'AutoyKBRaHSBHy9RsmXCZMy6nNFAg5FYijrvZyQcNLV'
  );

  // Accounts.
  const resolvedAccounts = {
    signer: {
      index: 0,
      isWritable: true as boolean,
      value: input.signer ?? null,
    },
    systemProgram: {
      index: 1,
      isWritable: false as boolean,
      value: input.systemProgram ?? null,
    },
    tokenProgram: {
      index: 2,
      isWritable: false as boolean,
      value: input.tokenProgram ?? null,
    },
    rent: { index: 3, isWritable: false as boolean, value: input.rent ?? null },
    referralState: {
      index: 4,
      isWritable: false as boolean,
      value: input.referralState ?? null,
    },
    referralFeesTa: {
      index: 5,
      isWritable: true as boolean,
      value: input.referralFeesTa ?? null,
    },
    referralFeesMint: {
      index: 6,
      isWritable: true as boolean,
      value: input.referralFeesMint ?? null,
    },
  } satisfies ResolvedAccountsWithIndices;

  // Default values.
  if (!resolvedAccounts.systemProgram.value) {
    resolvedAccounts.systemProgram.value = context.programs.getPublicKey(
      'splSystem',
      '11111111111111111111111111111111'
    );
    resolvedAccounts.systemProgram.isWritable = false;
  }
  if (!resolvedAccounts.tokenProgram.value) {
    resolvedAccounts.tokenProgram.value = context.programs.getPublicKey(
      'splToken',
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
    );
    resolvedAccounts.tokenProgram.isWritable = false;
  }
  if (!resolvedAccounts.rent.value) {
    resolvedAccounts.rent.value = publicKey(
      'SysvarRent111111111111111111111111111111111'
    );
  }

  // Accounts in order.
  const orderedAccounts: ResolvedAccount[] = Object.values(
    resolvedAccounts
  ).sort((a, b) => a.index - b.index);

  // Keys and Signers.
  const [keys, signers] = getAccountMetasAndSigners(
    orderedAccounts,
    'programId',
    programId
  );

  // Data.
  const data = getClaimReferralFeesInstructionDataSerializer().serialize({});

  // Bytes Created On Chain.
  const bytesCreatedOnChain = 0;

  return transactionBuilder([
    { instruction: { keys, programId, data }, signers, bytesCreatedOnChain },
  ]);
}