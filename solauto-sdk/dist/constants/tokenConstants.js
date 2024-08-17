"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STABLECOINS = exports.TOKEN_DECIMALS = exports.ALL_SUPPORTED_TOKENS = exports.USDC_MINT = void 0;
const spl_token_1 = require("@solana/spl-token");
// When adding token ensure a price feed is provided in pythConstants.ts & the token is added to the necessary lists below
exports.USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
exports.ALL_SUPPORTED_TOKENS = [
    spl_token_1.NATIVE_MINT.toString(),
    exports.USDC_MINT,
];
exports.TOKEN_DECIMALS = {
    [spl_token_1.NATIVE_MINT.toString()]: 9,
    [exports.USDC_MINT]: 6
};
exports.STABLECOINS = [
    exports.USDC_MINT
];
