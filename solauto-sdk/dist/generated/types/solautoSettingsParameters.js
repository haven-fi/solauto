"use strict";
/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSolautoSettingsParametersSerializer = getSolautoSettingsParametersSerializer;
const serializers_1 = require("@metaplex-foundation/umi/serializers");
const _1 = require(".");
function getSolautoSettingsParametersSerializer() {
    return (0, serializers_1.struct)([
        ['boostToBps', (0, serializers_1.u16)()],
        ['boostGap', (0, serializers_1.u16)()],
        ['repayToBps', (0, serializers_1.u16)()],
        ['repayGap', (0, serializers_1.u16)()],
        ['targetBoostToBps', (0, serializers_1.u16)()],
        ['padding1', (0, serializers_1.array)((0, serializers_1.u8)(), { size: 6 })],
        ['automation', (0, _1.getAutomationSettingsSerializer)()],
        ['padding', (0, serializers_1.bytes)({ size: 32 })],
    ], { description: 'SolautoSettingsParameters' });
}
