/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */

import {
  Context,
  Option,
  OptionOrNullable,
  Pda,
  PublicKey,
  Signer,
  TransactionBuilder,
  transactionBuilder,
} from '@metaplex-foundation/umi';
import {
  Serializer,
  array,
  mapSerializer,
  option,
  struct,
  u64,
  u8,
} from '@metaplex-foundation/umi/serializers';
import {
  ResolvedAccount,
  ResolvedAccountsWithIndices,
  getAccountMetasAndSigners,
} from '../shared';

// Accounts.
export type LendingPoolUpdateEmissionsParametersInstructionAccounts = {
  marginfiGroup: PublicKey | Pda;
  admin: Signer;
  bank: PublicKey | Pda;
  emissionsMint: PublicKey | Pda;
  emissionsTokenAccount: PublicKey | Pda;
  emissionsFundingAccount: PublicKey | Pda;
  tokenProgram?: PublicKey | Pda;
};

// Data.
export type LendingPoolUpdateEmissionsParametersInstructionData = {
  discriminator: Array<number>;
  emissionsFlags: Option<bigint>;
  emissionsRate: Option<bigint>;
  additionalEmissions: Option<bigint>;
};

export type LendingPoolUpdateEmissionsParametersInstructionDataArgs = {
  emissionsFlags: OptionOrNullable<number | bigint>;
  emissionsRate: OptionOrNullable<number | bigint>;
  additionalEmissions: OptionOrNullable<number | bigint>;
};

export function getLendingPoolUpdateEmissionsParametersInstructionDataSerializer(): Serializer<
  LendingPoolUpdateEmissionsParametersInstructionDataArgs,
  LendingPoolUpdateEmissionsParametersInstructionData
> {
  return mapSerializer<
    LendingPoolUpdateEmissionsParametersInstructionDataArgs,
    any,
    LendingPoolUpdateEmissionsParametersInstructionData
  >(
    struct<LendingPoolUpdateEmissionsParametersInstructionData>(
      [
        ['discriminator', array(u8(), { size: 8 })],
        ['emissionsFlags', option(u64())],
        ['emissionsRate', option(u64())],
        ['additionalEmissions', option(u64())],
      ],
      { description: 'LendingPoolUpdateEmissionsParametersInstructionData' }
    ),
    (value) => ({
      ...value,
      discriminator: [55, 213, 224, 168, 153, 53, 197, 40],
    })
  ) as Serializer<
    LendingPoolUpdateEmissionsParametersInstructionDataArgs,
    LendingPoolUpdateEmissionsParametersInstructionData
  >;
}

// Args.
export type LendingPoolUpdateEmissionsParametersInstructionArgs =
  LendingPoolUpdateEmissionsParametersInstructionDataArgs;

// Instruction.
export function lendingPoolUpdateEmissionsParameters(
  context: Pick<Context, 'programs'>,
  input: LendingPoolUpdateEmissionsParametersInstructionAccounts &
    LendingPoolUpdateEmissionsParametersInstructionArgs
): TransactionBuilder {
  // Program ID.
  const programId = context.programs.getPublicKey(
    'marginfi',
    'MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA'
  );

  // Accounts.
  const resolvedAccounts = {
    marginfiGroup: {
      index: 0,
      isWritable: false as boolean,
      value: input.marginfiGroup ?? null,
    },
    admin: {
      index: 1,
      isWritable: true as boolean,
      value: input.admin ?? null,
    },
    bank: { index: 2, isWritable: true as boolean, value: input.bank ?? null },
    emissionsMint: {
      index: 3,
      isWritable: false as boolean,
      value: input.emissionsMint ?? null,
    },
    emissionsTokenAccount: {
      index: 4,
      isWritable: true as boolean,
      value: input.emissionsTokenAccount ?? null,
    },
    emissionsFundingAccount: {
      index: 5,
      isWritable: true as boolean,
      value: input.emissionsFundingAccount ?? null,
    },
    tokenProgram: {
      index: 6,
      isWritable: false as boolean,
      value: input.tokenProgram ?? null,
    },
  } satisfies ResolvedAccountsWithIndices;

  // Arguments.
  const resolvedArgs: LendingPoolUpdateEmissionsParametersInstructionArgs = {
    ...input,
  };

  // Default values.
  if (!resolvedAccounts.tokenProgram.value) {
    resolvedAccounts.tokenProgram.value = context.programs.getPublicKey(
      'splToken',
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
    );
    resolvedAccounts.tokenProgram.isWritable = false;
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
  const data =
    getLendingPoolUpdateEmissionsParametersInstructionDataSerializer().serialize(
      resolvedArgs as LendingPoolUpdateEmissionsParametersInstructionDataArgs
    );

  // Bytes Created On Chain.
  const bytesCreatedOnChain = 0;

  return transactionBuilder([
    { instruction: { keys, programId, data }, signers, bytesCreatedOnChain },
  ]);
}
