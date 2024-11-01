"use strict";
/**
 * This code was AUTOGENERATED using the kinobi library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun kinobi to update it.
 *
 * @see https://github.com/metaplex-foundation/kinobi
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskTier = void 0;
exports.getRiskTierSerializer = getRiskTierSerializer;
const serializers_1 = require("@metaplex-foundation/umi/serializers");
var RiskTier;
(function (RiskTier) {
    RiskTier[RiskTier["Collateral"] = 0] = "Collateral";
    RiskTier[RiskTier["Isolated"] = 1] = "Isolated";
})(RiskTier || (exports.RiskTier = RiskTier = {}));
function getRiskTierSerializer() {
    return (0, serializers_1.scalarEnum)(RiskTier, {
        description: 'RiskTier',
    });
}
