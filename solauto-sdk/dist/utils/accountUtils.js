"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bufferFromU8 = bufferFromU8;
exports.bufferFromU64 = bufferFromU64;
exports.getTokenAccount = getTokenAccount;
exports.getTokenAccounts = getTokenAccounts;
exports.getSolautoPositionAccount = getSolautoPositionAccount;
exports.getReferralState = getReferralState;
exports.getMarginfiAccountPDA = getMarginfiAccountPDA;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const generated_1 = require("../generated");
function bufferFromU8(num) {
    const buffer = Buffer.alloc(1);
    buffer.writeUInt8(num);
    return buffer;
}
function bufferFromU64(num) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64LE(num);
    return buffer;
}
function getTokenAccount(wallet, tokenMint) {
    return (0, spl_token_1.getAssociatedTokenAddressSync)(tokenMint, wallet, true);
}
function getTokenAccounts(wallet, tokenMints) {
    return tokenMints.map(x => getTokenAccount(wallet, x));
}
function getSolautoPositionAccount(signer, positionId) {
    const [positionAccount, _] = web3_js_1.PublicKey.findProgramAddressSync([bufferFromU8(positionId), signer.toBuffer()], new web3_js_1.PublicKey(generated_1.SOLAUTO_PROGRAM_ID));
    return positionAccount;
}
function getReferralState(authority) {
    const str = "referral_state";
    const strBuffer = Buffer.from(str, "utf-8");
    const [ReferralState, _] = web3_js_1.PublicKey.findProgramAddressSync([strBuffer, authority.toBuffer()], new web3_js_1.PublicKey(generated_1.SOLAUTO_PROGRAM_ID));
    return ReferralState;
}
async function getMarginfiAccountPDA(solautoPositionAccount, marginfiAccountSeedIdx) {
    const seeds = [
        solautoPositionAccount.toBuffer(),
        bufferFromU64(marginfiAccountSeedIdx),
    ];
    const [marginfiAccount, _] = await web3_js_1.PublicKey.findProgramAddress(seeds, new web3_js_1.PublicKey(generated_1.SOLAUTO_PROGRAM_ID));
    return marginfiAccount;
}
