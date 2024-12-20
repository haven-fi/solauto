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
  transactionBuilder,
} from '@metaplex-foundation/umi';
import {
  Serializer,
  array,
  mapSerializer,
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
export type LendingAccountLiquidateInstructionAccounts = {
  marginfiGroup: PublicKey | Pda;
  assetBank: PublicKey | Pda;
  liabBank: PublicKey | Pda;
  liquidatorMarginfiAccount: PublicKey | Pda;
  signer: Signer;
  liquidateeMarginfiAccount: PublicKey | Pda;
  bankLiquidityVaultAuthority: PublicKey | Pda;
  bankLiquidityVault: PublicKey | Pda;
  bankInsuranceVault: PublicKey | Pda;
  tokenProgram?: PublicKey | Pda;
};

// Data.
export type LendingAccountLiquidateInstructionData = {
  discriminator: Array<number>;
  assetAmount: bigint;
};

export type LendingAccountLiquidateInstructionDataArgs = {
  assetAmount: number | bigint;
};

export function getLendingAccountLiquidateInstructionDataSerializer(): Serializer<
  LendingAccountLiquidateInstructionDataArgs,
  LendingAccountLiquidateInstructionData
> {
  return mapSerializer<
    LendingAccountLiquidateInstructionDataArgs,
    any,
    LendingAccountLiquidateInstructionData
  >(
    struct<LendingAccountLiquidateInstructionData>(
      [
        ['discriminator', array(u8(), { size: 8 })],
        ['assetAmount', u64()],
      ],
      { description: 'LendingAccountLiquidateInstructionData' }
    ),
    (value) => ({
      ...value,
      discriminator: [214, 169, 151, 213, 251, 167, 86, 219],
    })
  ) as Serializer<
    LendingAccountLiquidateInstructionDataArgs,
    LendingAccountLiquidateInstructionData
  >;
}

// Args.
export type LendingAccountLiquidateInstructionArgs =
  LendingAccountLiquidateInstructionDataArgs;

// Instruction.
export function lendingAccountLiquidate(
  context: Pick<Context, 'programs'>,
  input: LendingAccountLiquidateInstructionAccounts &
    LendingAccountLiquidateInstructionArgs
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
    assetBank: {
      index: 1,
      isWritable: true as boolean,
      value: input.assetBank ?? null,
    },
    liabBank: {
      index: 2,
      isWritable: true as boolean,
      value: input.liabBank ?? null,
    },
    liquidatorMarginfiAccount: {
      index: 3,
      isWritable: true as boolean,
      value: input.liquidatorMarginfiAccount ?? null,
    },
    signer: {
      index: 4,
      isWritable: false as boolean,
      value: input.signer ?? null,
    },
    liquidateeMarginfiAccount: {
      index: 5,
      isWritable: true as boolean,
      value: input.liquidateeMarginfiAccount ?? null,
    },
    bankLiquidityVaultAuthority: {
      index: 6,
      isWritable: true as boolean,
      value: input.bankLiquidityVaultAuthority ?? null,
    },
    bankLiquidityVault: {
      index: 7,
      isWritable: true as boolean,
      value: input.bankLiquidityVault ?? null,
    },
    bankInsuranceVault: {
      index: 8,
      isWritable: true as boolean,
      value: input.bankInsuranceVault ?? null,
    },
    tokenProgram: {
      index: 9,
      isWritable: false as boolean,
      value: input.tokenProgram ?? null,
    },
  } satisfies ResolvedAccountsWithIndices;

  // Arguments.
  const resolvedArgs: LendingAccountLiquidateInstructionArgs = { ...input };

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
  const data = getLendingAccountLiquidateInstructionDataSerializer().serialize(
    resolvedArgs as LendingAccountLiquidateInstructionDataArgs
  );

  // Bytes Created On Chain.
  const bytesCreatedOnChain = 0;

  return transactionBuilder([
    { instruction: { keys, programId, data }, signers, bytesCreatedOnChain },
  ]);
}
