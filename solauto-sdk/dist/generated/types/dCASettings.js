"use strict";
/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDCASettingsSerializer = getDCASettingsSerializer;
const serializers_1 = require("@metaplex-foundation/umi/serializers");
const _1 = require(".");
function getDCASettingsSerializer() {
    return (0, serializers_1.struct)([
        ['automation', (0, _1.getAutomationSettingsSerializer)()],
        ['debtToAddBaseUnit', (0, serializers_1.u64)()],
        ['padding', (0, serializers_1.bytes)({ size: 32 })],
    ], { description: 'DCASettings' });
}
