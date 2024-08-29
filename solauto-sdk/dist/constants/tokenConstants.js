"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOKEN_INFO = exports.ALL_SUPPORTED_TOKENS = exports.JUP = exports.B_SOL = exports.USDC_MINT = void 0;
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
// When adding token ensure a price feed is provided in pythConstants.ts & the token is in TOKEN_INFO
exports.USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
exports.B_SOL = "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1";
exports.JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
exports.ALL_SUPPORTED_TOKENS = [
    spl_token_1.NATIVE_MINT.toString(),
    exports.USDC_MINT,
    exports.B_SOL,
    exports.JUP,
];
exports.TOKEN_INFO = {
    [web3_js_1.PublicKey.default.toString()]: {
        ticker: "",
        decimals: 1
    },
    [spl_token_1.NATIVE_MINT.toString()]: {
        ticker: "SOL",
        decimals: 9,
    },
    [exports.USDC_MINT]: {
        ticker: "USDC",
        decimals: 6,
        isStableCoin: true
    },
    [exports.B_SOL]: {
        ticker: "BSOL",
        decimals: 9,
        isLST: true
    },
    [exports.JUP]: {
        ticker: "JUP",
        decimals: 6
    }
};
