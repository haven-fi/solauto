/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */
import { GetDataEnumKind, GetDataEnumKindContent, Serializer } from '@metaplex-foundation/umi/serializers';
import { TokenBalanceAmount, TokenBalanceAmountArgs } from '.';
export type SolautoAction = {
    __kind: 'Deposit';
    fields: [bigint];
} | {
    __kind: 'Borrow';
    fields: [bigint];
} | {
    __kind: 'Repay';
    fields: [TokenBalanceAmount];
} | {
    __kind: 'Withdraw';
    fields: [TokenBalanceAmount];
};
export type SolautoActionArgs = {
    __kind: 'Deposit';
    fields: [number | bigint];
} | {
    __kind: 'Borrow';
    fields: [number | bigint];
} | {
    __kind: 'Repay';
    fields: [TokenBalanceAmountArgs];
} | {
    __kind: 'Withdraw';
    fields: [TokenBalanceAmountArgs];
};
export declare function getSolautoActionSerializer(): Serializer<SolautoActionArgs, SolautoAction>;
export declare function solautoAction(kind: 'Deposit', data: GetDataEnumKindContent<SolautoActionArgs, 'Deposit'>['fields']): GetDataEnumKind<SolautoActionArgs, 'Deposit'>;
export declare function solautoAction(kind: 'Borrow', data: GetDataEnumKindContent<SolautoActionArgs, 'Borrow'>['fields']): GetDataEnumKind<SolautoActionArgs, 'Borrow'>;
export declare function solautoAction(kind: 'Repay', data: GetDataEnumKindContent<SolautoActionArgs, 'Repay'>['fields']): GetDataEnumKind<SolautoActionArgs, 'Repay'>;
export declare function solautoAction(kind: 'Withdraw', data: GetDataEnumKindContent<SolautoActionArgs, 'Withdraw'>['fields']): GetDataEnumKind<SolautoActionArgs, 'Withdraw'>;
export declare function isSolautoAction<K extends SolautoAction['__kind']>(kind: K, value: SolautoAction): value is SolautoAction & {
    __kind: K;
};
//# sourceMappingURL=solautoAction.d.ts.map