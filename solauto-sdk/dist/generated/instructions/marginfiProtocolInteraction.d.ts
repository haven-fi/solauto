/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */
import { Context, Pda, PublicKey, Signer, TransactionBuilder } from '@metaplex-foundation/umi';
import { Serializer } from '@metaplex-foundation/umi/serializers';
import { SolautoAction, SolautoActionArgs } from '../types';
export type MarginfiProtocolInteractionInstructionAccounts = {
    signer: Signer;
    marginfiProgram: PublicKey | Pda;
    systemProgram?: PublicKey | Pda;
    tokenProgram?: PublicKey | Pda;
    ataProgram?: PublicKey | Pda;
    rent?: PublicKey | Pda;
    solautoPosition: PublicKey | Pda;
    marginfiGroup: PublicKey | Pda;
    marginfiAccount: PublicKey | Pda;
    supplyBank: PublicKey | Pda;
    supplyPriceOracle?: PublicKey | Pda;
    positionSupplyTa?: PublicKey | Pda;
    vaultSupplyTa?: PublicKey | Pda;
    supplyVaultAuthority?: PublicKey | Pda;
    debtBank: PublicKey | Pda;
    debtPriceOracle?: PublicKey | Pda;
    positionDebtTa?: PublicKey | Pda;
    vaultDebtTa?: PublicKey | Pda;
    debtVaultAuthority?: PublicKey | Pda;
};
export type MarginfiProtocolInteractionInstructionData = {
    discriminator: number;
    solautoAction: SolautoAction;
};
export type MarginfiProtocolInteractionInstructionDataArgs = {
    solautoAction: SolautoActionArgs;
};
export declare function getMarginfiProtocolInteractionInstructionDataSerializer(): Serializer<MarginfiProtocolInteractionInstructionDataArgs, MarginfiProtocolInteractionInstructionData>;
export type MarginfiProtocolInteractionInstructionArgs = MarginfiProtocolInteractionInstructionDataArgs;
export declare function marginfiProtocolInteraction(context: Pick<Context, 'programs'>, input: MarginfiProtocolInteractionInstructionAccounts & MarginfiProtocolInteractionInstructionArgs): TransactionBuilder;
//# sourceMappingURL=marginfiProtocolInteraction.d.ts.map