"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReferralStateManager = void 0;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const umi_1 = require("@metaplex-foundation/umi");
const umi_web3js_adapters_1 = require("@metaplex-foundation/umi-web3js-adapters");
const umi_signer_wallet_adapters_1 = require("@metaplex-foundation/umi-signer-wallet-adapters");
const generated_1 = require("../generated");
const utils_1 = require("../utils");
const txHandler_1 = require("./txHandler");
const constants_1 = require("../constants");
class ReferralStateManager extends txHandler_1.TxHandler {
    constructor(heliusApiUrl, localTest) {
        super(heliusApiUrl, localTest);
        this.localTest = localTest;
        this.umi = this.umi.use({
            install(umi) {
                umi.programs.add((0, generated_1.createSolautoProgram)(), false);
            },
        });
    }
    async initialize(args) {
        if (!args.signer && !args.wallet) {
            throw new Error("Signer or wallet must be provided");
        }
        this.umi = this.umi.use(args.signer
            ? (0, umi_1.signerIdentity)(args.signer)
            : (0, umi_signer_wallet_adapters_1.walletAdapterIdentity)(args.wallet, true));
        this.signer = this.umi.identity;
        this.referralState = (0, utils_1.getReferralState)(args.referralAuthority ?? (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey));
        this.referralStateData = await (0, generated_1.safeFetchReferralState)(this.umi, (0, umi_1.publicKey)(this.referralState), { commitment: "confirmed" });
        this.setReferredBy(args.referredByAuthority);
    }
    defaultLookupTables() {
        return this.referralStateData?.lookupTable &&
            !(0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.referralStateData.lookupTable).equals(web3_js_1.PublicKey.default)
            ? [constants_1.SOLAUTO_LUT, this.referralStateData?.lookupTable.toString()]
            : [constants_1.SOLAUTO_LUT];
    }
    setReferredBy(referredBy) {
        const authorityReferralStateData = this.referralStateData;
        const hasReferredBy = authorityReferralStateData &&
            authorityReferralStateData.referredByState !==
                (0, umi_1.publicKey)(web3_js_1.PublicKey.default);
        const referredByAuthority = !hasReferredBy &&
            referredBy &&
            !referredBy.equals((0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey))
            ? referredBy
            : undefined;
        this.referredBy = referredByAuthority;
    }
    updateReferralStatesIx(destFeesMint, lookupTable) {
        return (0, generated_1.updateReferralStates)(this.umi, {
            signer: this.signer,
            signerReferralState: (0, umi_1.publicKey)(this.referralState),
            referralFeesDestMint: destFeesMint ? (0, umi_1.publicKey)(destFeesMint) : null,
            referredByState: this.referredBy
                ? (0, umi_1.publicKey)((0, utils_1.getReferralState)(this.referredBy))
                : undefined,
            referredByAuthority: this.referredBy
                ? (0, umi_1.publicKey)(this.referredBy)
                : undefined,
            addressLookupTable: lookupTable ? (0, umi_1.publicKey)(lookupTable) : null,
        });
    }
    claimReferralFeesIx(destFeesMint) {
        const referralFeesDestMint = destFeesMint ?? (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.referralStateData.destFeesMint);
        const referralDestTa = (0, utils_1.getTokenAccount)(this.referralState, referralFeesDestMint);
        const feesDestinationTa = referralFeesDestMint !== spl_token_1.NATIVE_MINT
            ? (0, umi_1.publicKey)((0, utils_1.getTokenAccount)((0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey), referralFeesDestMint))
            : undefined;
        return (0, generated_1.claimReferralFees)(this.umi, {
            signer: this.signer,
            signerWsolTa: (0, umi_1.publicKey)((0, utils_1.getTokenAccount)((0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey), spl_token_1.NATIVE_MINT)),
            referralAuthority: (0, umi_1.publicKey)(this.referralAuthority),
            referralState: (0, umi_1.publicKey)(this.referralState),
            referralFeesDestTa: (0, umi_1.publicKey)(referralDestTa),
            referralFeesDestMint: (0, umi_1.publicKey)(referralFeesDestMint),
            feesDestinationTa,
        });
    }
    async resetLiveTxUpdates(success) { }
}
exports.ReferralStateManager = ReferralStateManager;
