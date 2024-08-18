"use strict";
/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInterestRateConfigOptSerializer = getInterestRateConfigOptSerializer;
const serializers_1 = require("@metaplex-foundation/umi/serializers");
const _1 = require(".");
function getInterestRateConfigOptSerializer() {
    return (0, serializers_1.struct)([
        ['optimalUtilizationRate', (0, serializers_1.option)((0, _1.getWrappedI80F48Serializer)())],
        ['plateauInterestRate', (0, serializers_1.option)((0, _1.getWrappedI80F48Serializer)())],
        ['maxInterestRate', (0, serializers_1.option)((0, _1.getWrappedI80F48Serializer)())],
        ['insuranceFeeFixedApr', (0, serializers_1.option)((0, _1.getWrappedI80F48Serializer)())],
        ['insuranceIrFee', (0, serializers_1.option)((0, _1.getWrappedI80F48Serializer)())],
        ['protocolFixedFeeApr', (0, serializers_1.option)((0, _1.getWrappedI80F48Serializer)())],
        ['protocolIrFee', (0, serializers_1.option)((0, _1.getWrappedI80F48Serializer)())],
    ], { description: 'InterestRateConfigOpt' });
}