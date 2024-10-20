"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STANDARD_LUT_ACCOUNTS = exports.SOLAUTO_LUT = exports.PRICES = exports.MIN_BOOST_GAP_BPS = exports.MIN_REPAY_GAP_BPS = exports.MIN_POSITION_STATE_FRESHNESS_SECS = exports.BASIS_POINTS = exports.SOLAUTO_TEST_PROGRAM = exports.SOLAUTO_PROD_PROGRAM = void 0;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
// import { JitoRpcConnection } from "jito-ts";
const generated_1 = require("../generated");
const generalAccounts_1 = require("./generalAccounts");
const jupiter_sdk_1 = require("../jupiter-sdk");
exports.SOLAUTO_PROD_PROGRAM = new web3_js_1.PublicKey("AutoyKBRaHSBHy9RsmXCZMy6nNFAg5FYijrvZyQcNLV");
exports.SOLAUTO_TEST_PROGRAM = new web3_js_1.PublicKey("TesTjfQ6TbXv96Tv6fqr95XTZ1LYPxtkafmShN9PjBp");
globalThis.LOCAL_TEST = false;
exports.BASIS_POINTS = 10000;
exports.MIN_POSITION_STATE_FRESHNESS_SECS = 5;
exports.MIN_REPAY_GAP_BPS = 50;
exports.MIN_BOOST_GAP_BPS = 50;
exports.PRICES = {};
exports.SOLAUTO_LUT = "9D4xwZwDf46n9ft5gQxZzq3rBbdRXsXojKQLZbBdskPY";
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
    jupiter_sdk_1.JUPITER_PROGRAM_ID
];
// export const JITO_BLOCK_ENGINE = "ny.mainnet.block-engine.jito.wtf";
// export const JITO_CONNECTION = new JitoRpcConnection(
//   `https://${JITO_BLOCK_ENGINE}`,
//   "finalized"
// );
