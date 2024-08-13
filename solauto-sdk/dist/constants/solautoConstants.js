"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STANDARD_LUT_ACCOUNTS = exports.JUPITER_PROGRAM_ID = exports.SOLAUTO_LUT = exports.PRICES = exports.MAX_REPAY_GAP_BPS = exports.MIN_POSITION_STATE_FRESHNESS_SECS = exports.DEFAULT_LIMIT_GAP_BPS = exports.DEFAULT_RISK_AVERSION_BPS = void 0;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
// import { JitoRpcConnection } from "jito-ts";
const generated_1 = require("../generated");
const generalAccounts_1 = require("./generalAccounts");
exports.DEFAULT_RISK_AVERSION_BPS = 1500;
exports.DEFAULT_LIMIT_GAP_BPS = 1000;
exports.MIN_POSITION_STATE_FRESHNESS_SECS = 5;
exports.MAX_REPAY_GAP_BPS = 100;
// export const JITO_BLOCK_ENGINE = "ny.mainnet.block-engine.jito.wtf";
// export const JITO_CONNECTION = new JitoRpcConnection(
//   `https://${JITO_BLOCK_ENGINE}`,
//   "finalized"
// );
exports.PRICES = {};
exports.SOLAUTO_LUT = "9D4xwZwDf46n9ft5gQxZzq3rBbdRXsXojKQLZbBdskPY";
exports.JUPITER_PROGRAM_ID = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
exports.STANDARD_LUT_ACCOUNTS = [
    web3_js_1.PublicKey.default.toString(),
    generated_1.SOLAUTO_PROGRAM_ID,
    generalAccounts_1.SOLAUTO_MANAGER.toString(),
    web3_js_1.SystemProgram.programId.toString(),
    spl_token_1.TOKEN_PROGRAM_ID.toString(),
    spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID.toString(),
    web3_js_1.SYSVAR_CLOCK_PUBKEY.toString(),
    web3_js_1.SYSVAR_RENT_PUBKEY.toString(),
    web3_js_1.SYSVAR_INSTRUCTIONS_PUBKEY.toString(),
    exports.JUPITER_PROGRAM_ID
];
