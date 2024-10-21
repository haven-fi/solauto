"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bufferFromU8 = bufferFromU8;
exports.bufferFromU64 = bufferFromU64;
exports.getTokenAccount = getTokenAccount;
exports.getTokenAccounts = getTokenAccounts;
exports.getTokenAccountData = getTokenAccountData;
exports.getSolautoPositionAccount = getSolautoPositionAccount;
exports.getReferralState = getReferralState;
exports.getMarginfiAccountPDA = getMarginfiAccountPDA;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const umi_1 = require("@metaplex-foundation/umi");
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
async function getTokenAccountData(umi, tokenAccount) {
    const resp = await umi.rpc.getAccount((0, umi_1.publicKey)(tokenAccount), { commitment: "confirmed" });
    if (resp.exists) {
        return spl_token_1.AccountLayout.decode(resp.data);
    }
    else {
        return undefined;
    }
}
function getSolautoPositionAccount(signer, positionId, programId) {
    const [positionAccount, _] = web3_js_1.PublicKey.findProgramAddressSync([bufferFromU8(positionId), signer.toBuffer()], programId);
    return positionAccount;
}
function getReferralState(authority, programId) {
    const str = "referral_state";
    const strBuffer = Buffer.from(str, "utf-8");
    const [ReferralState, _] = web3_js_1.PublicKey.findProgramAddressSync([strBuffer, authority.toBuffer()], programId);
    return ReferralState;
}
function getMarginfiAccountPDA(solautoPositionAccount, marginfiAccountSeedIdx, programId) {
    const seeds = [
        solautoPositionAccount.toBuffer(),
        bufferFromU64(marginfiAccountSeedIdx),
    ];
    const [marginfiAccount, _] = web3_js_1.PublicKey.findProgramAddressSync(seeds, programId);
    return marginfiAccount;
}
