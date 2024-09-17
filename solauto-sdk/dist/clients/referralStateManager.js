"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReferralStateManager = void 0;
const spl_token_1 = require("@solana/spl-token");
const umi_1 = require("@metaplex-foundation/umi");
const umi_web3js_adapters_1 = require("@metaplex-foundation/umi-web3js-adapters");
const umi_signer_wallet_adapters_1 = require("@metaplex-foundation/umi-signer-wallet-adapters");
const generated_1 = require("../generated");
const utils_1 = require("../utils");
const txHandler_1 = require("./txHandler");
class ReferralStateManager extends txHandler_1.TxHandler {
    constructor(heliusApiKey, localTest) {
        super(heliusApiKey, localTest);
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
        this.referralStateData = await (0, generated_1.safeFetchReferralState)(this.umi, (0, umi_1.publicKey)(this.referralState));
    }
    defaultLookupTables() {
        return this.referralStateData?.lookupTable ? [this.referralStateData?.lookupTable.toString()] : [];
    }
    updateReferralStatesIx(destFeesMint, referredBy, lookupTable) {
        return (0, generated_1.updateReferralStates)(this.umi, {
            signer: this.signer,
            signerReferralState: (0, umi_1.publicKey)(this.referralState),
            referralFeesDestMint: destFeesMint ? (0, umi_1.publicKey)(destFeesMint) : null,
            referredByState: referredBy
                ? (0, umi_1.publicKey)((0, utils_1.getReferralState)(referredBy))
                : undefined,
            referredByAuthority: referredBy
                ? (0, umi_1.publicKey)(referredBy)
                : undefined,
            addressLookupTable: lookupTable
                ? (0, umi_1.publicKey)(lookupTable)
                : null,
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
