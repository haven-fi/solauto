"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolautoClient = void 0;
require("rpc-websockets/dist/lib/client");
const web3_js_1 = require("@solana/web3.js");
const umi_1 = require("@metaplex-foundation/umi");
const umi_web3js_adapters_1 = require("@metaplex-foundation/umi-web3js-adapters");
const generated_1 = require("../generated");
const accountUtils_1 = require("../utils/accountUtils");
const generalAccounts_1 = require("../constants/generalAccounts");
const solanaUtils_1 = require("../utils/solanaUtils");
const solautoConstants_1 = require("../constants/solautoConstants");
const generalUtils_1 = require("../utils/generalUtils");
const generalUtils_2 = require("../utils/solauto/generalUtils");
const referralStateManager_1 = require("./referralStateManager");
class SolautoClient extends referralStateManager_1.ReferralStateManager {
    constructor() {
        super(...arguments);
        this.livePositionUpdates = new generalUtils_2.LivePositionUpdates();
    }
    async initialize(args) {
        await super.initialize(args);
        this.positionId = args.positionId ?? 0;
        this.selfManaged = this.positionId === 0;
        this.solautoPosition = (0, accountUtils_1.getSolautoPositionAccount)(this.authority, this.positionId, this.programId);
        this.solautoPositionData = !args.new
            ? await (0, generated_1.safeFetchSolautoPosition)(this.umi, (0, umi_1.publicKey)(this.solautoPosition), { commitment: "confirmed" })
            : null;
        this.solautoPositionState = this.solautoPositionData?.state;
        this.maxLtvBps = undefined;
        this.liqThresholdBps = undefined;
        this.supplyMint =
            args.supplyMint ??
                (this.solautoPositionData
                    ? (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.solautoPositionData.position.supplyMint)
                    : web3_js_1.PublicKey.default);
        this.positionSupplyTa = (0, accountUtils_1.getTokenAccount)(this.solautoPosition, this.supplyMint);
        this.signerSupplyTa = (0, accountUtils_1.getTokenAccount)((0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey), this.supplyMint);
        this.debtMint =
            args.debtMint ??
                (this.solautoPositionData
                    ? (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.solautoPositionData.position.debtMint)
                    : web3_js_1.PublicKey.default);
        this.positionDebtTa = (0, accountUtils_1.getTokenAccount)(this.solautoPosition, this.debtMint);
        this.signerDebtTa = (0, accountUtils_1.getTokenAccount)((0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey), this.debtMint);
        this.solautoFeesSupplyTa = (0, accountUtils_1.getTokenAccount)(generalAccounts_1.SOLAUTO_FEES_WALLET, this.supplyMint);
        this.solautoFeesDebtTa = (0, accountUtils_1.getTokenAccount)(generalAccounts_1.SOLAUTO_FEES_WALLET, this.debtMint);
        this.authorityLutAddress =
            this.referralStateData?.lookupTable &&
                !(0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.referralStateData.lookupTable).equals(web3_js_1.PublicKey.default)
                ? (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.referralStateData.lookupTable)
                : undefined;
        this.log("Position state: ", this.solautoPositionState);
        this.log("Position settings: ", this.solautoPositionData?.position?.settingParams);
        this.log("Position DCA: ", (this.solautoPositionData?.position?.dca?.automation?.targetPeriods ??
            0) > 0
            ? this.solautoPositionData?.position?.dca
            : undefined);
    }
    referredBySupplyTa() {
        if (this.referredByState !== undefined) {
            return (0, accountUtils_1.getTokenAccount)(this.referredByState, this.supplyMint);
        }
        return undefined;
    }
    referredByDebtTa() {
        if (this.referredByState !== undefined) {
            return (0, accountUtils_1.getTokenAccount)(this.referredByState, this.debtMint);
        }
        return undefined;
    }
    async resetLiveTxUpdates(success) {
        if (success) {
            if (!this.solautoPositionData) {
                this.solautoPositionData = await (0, generated_1.safeFetchSolautoPosition)(this.umi, (0, umi_1.publicKey)(this.solautoPosition), { commitment: "confirmed" });
            }
            else {
                if (this.livePositionUpdates.activeDca) {
                    this.solautoPositionData.position.dca =
                        this.livePositionUpdates.activeDca;
                }
                if (this.livePositionUpdates.settings) {
                    this.solautoPositionData.position.settingParams =
                        this.livePositionUpdates.settings;
                }
                // All other live position updates can be derived by getting a fresh position state, so we don't need to do anything else form livePositionUpdates
            }
        }
        this.livePositionUpdates.reset();
    }
    defaultLookupTables() {
        return [
            solautoConstants_1.SOLAUTO_LUT,
            ...(this.authorityLutAddress
                ? [this.authorityLutAddress.toString()]
                : []),
        ];
    }
    lutAccountsToAdd() {
        return [
            this.authority,
            ...((0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey).equals(this.authority)
                ? [this.signerSupplyTa]
                : []),
            ...((0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey).equals(this.authority)
                ? [this.signerDebtTa]
                : []),
            this.solautoPosition,
            this.positionSupplyTa,
            this.positionDebtTa,
            this.referralState,
            ...(this.referredBySupplyTa() ? [this.referredBySupplyTa()] : []),
            ...(this.referredByDebtTa() ? [this.referredByDebtTa()] : []),
            ...(this.referredBy && !this.referralStateData?.referredByState
                ? [this.referredBy]
                : []),
        ];
    }
    async fetchExistingAuthorityLutAccounts() {
        const lookupTable = this.authorityLutAddress
            ? await this.connection.getAddressLookupTable(this.authorityLutAddress)
            : null;
        if (!lookupTable || lookupTable?.value === null) {
            this.authorityLutAddress = undefined;
        }
        return lookupTable?.value?.state.addresses ?? [];
    }
    async updateLookupTable() {
        const existingLutAccounts = await this.fetchExistingAuthorityLutAccounts();
        if (this.lutAccountsToAdd().every((element) => existingLutAccounts
            .map((x) => x.toString().toLowerCase())
            .includes(element.toString().toLowerCase()))) {
            return undefined;
        }
        let tx = (0, umi_1.transactionBuilder)();
        if (this.authorityLutAddress === undefined) {
            const [createLookupTableInst, lookupTableAddress] = web3_js_1.AddressLookupTableProgram.createLookupTable({
                authority: this.authority,
                payer: (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey),
                recentSlot: await this.umi.rpc.getSlot({ commitment: "finalized" }),
            });
            this.authorityLutAddress = lookupTableAddress;
            tx = tx.add((0, solanaUtils_1.getWrappedInstruction)(this.signer, createLookupTableInst));
        }
        const accountsToAdd = this.lutAccountsToAdd().filter((x) => !existingLutAccounts
            .map((x) => x.toString().toLowerCase())
            .includes(x.toString().toLowerCase()));
        if (accountsToAdd.length > 0) {
            tx = tx.add((0, solanaUtils_1.getWrappedInstruction)(this.signer, web3_js_1.AddressLookupTableProgram.extendLookupTable({
                payer: (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey),
                authority: this.authority,
                lookupTable: this.authorityLutAddress,
                addresses: accountsToAdd,
            })));
        }
        if (tx.getInstructions().length > 0) {
            this.log("Updating authority lookup table...");
        }
        return { updateLutTx: tx, needsToBeIsolated: true };
    }
    solautoPositionSettings() {
        return (this.livePositionUpdates.settings ??
            this.solautoPositionData?.position.settingParams);
    }
    solautoPositionActiveDca() {
        return (this.livePositionUpdates.activeDca ??
            this.solautoPositionData?.position.dca);
    }
    async maxLtvAndLiqThresholdBps() {
        if (this.maxLtvBps !== undefined && this.liqThresholdBps !== undefined) {
            return [this.maxLtvBps, this.liqThresholdBps];
        }
        return undefined;
    }
    openPosition(settingParams, dca) {
        if (dca && dca.dcaInBaseUnit > 0) {
            this.livePositionUpdates.new({
                type: "dcaInBalance",
                value: {
                    amount: BigInt(dca.dcaInBaseUnit),
                    tokenType: dca.tokenType,
                },
            });
        }
        if (settingParams) {
            this.livePositionUpdates.new({
                type: "settings",
                value: settingParams,
            });
        }
        if (dca) {
            this.livePositionUpdates.new({
                type: "dca",
                value: dca,
            });
        }
        return (0, umi_1.transactionBuilder)();
    }
    updatePositionIx(args) {
        let dcaMint = undefined;
        let positionDcaTa = undefined;
        let signerDcaTa = undefined;
        if ((0, umi_1.isOption)(args.dca) && (0, umi_1.isSome)(args.dca)) {
            if (args.dca.value.tokenType === generated_1.TokenType.Supply) {
                dcaMint = (0, umi_1.publicKey)(this.supplyMint);
                positionDcaTa = (0, umi_1.publicKey)(this.positionSupplyTa);
                signerDcaTa = (0, umi_1.publicKey)(this.signerSupplyTa);
            }
            else {
                dcaMint = (0, umi_1.publicKey)(this.debtMint);
                positionDcaTa = (0, umi_1.publicKey)(this.positionDebtTa);
                signerDcaTa = (0, umi_1.publicKey)(this.signerDebtTa);
            }
            let addingToPos = false;
            if ((0, umi_1.isOption)(args.dca) &&
                (0, umi_1.isSome)(args.dca) &&
                args.dca.value.dcaInBaseUnit > 0) {
                this.livePositionUpdates.new({
                    type: "dcaInBalance",
                    value: {
                        amount: BigInt(args.dca.value.dcaInBaseUnit),
                        tokenType: args.dca.value.tokenType,
                    },
                });
                addingToPos = true;
            }
        }
        if ((0, umi_1.isOption)(args.settingParams) && (0, umi_1.isSome)(args.settingParams)) {
            this.livePositionUpdates.new({
                type: "settings",
                value: args.settingParams.value,
            });
        }
        if ((0, umi_1.isOption)(args.dca) && (0, umi_1.isSome)(args.dca)) {
            this.livePositionUpdates.new({
                type: "dca",
                value: args.dca.value,
            });
        }
        return (0, generated_1.updatePosition)(this.umi, {
            signer: this.signer,
            solautoPosition: (0, umi_1.publicKey)(this.solautoPosition),
            dcaMint,
            positionDcaTa,
            signerDcaTa,
            updatePositionData: args,
        });
    }
    closePositionIx() {
        return (0, generated_1.closePosition)(this.umi, {
            signer: this.signer,
            solautoPosition: (0, umi_1.publicKey)(this.solautoPosition),
            signerSupplyTa: (0, umi_1.publicKey)(this.signerSupplyTa),
            positionSupplyTa: (0, umi_1.publicKey)(this.positionSupplyTa),
            positionDebtTa: (0, umi_1.publicKey)(this.positionDebtTa),
            signerDebtTa: (0, umi_1.publicKey)(this.signerDebtTa),
            protocolAccount: (0, umi_1.publicKey)(this.protocolAccount()),
        });
    }
    cancelDCAIx() {
        let dcaMint = undefined;
        let positionDcaTa = undefined;
        let signerDcaTa = undefined;
        const currDca = this.solautoPositionActiveDca();
        if (currDca.dcaInBaseUnit > 0) {
            if (currDca.tokenType === generated_1.TokenType.Supply) {
                dcaMint = (0, umi_1.publicKey)(this.supplyMint);
                positionDcaTa = (0, umi_1.publicKey)(this.positionSupplyTa);
                signerDcaTa = (0, umi_1.publicKey)(this.signerSupplyTa);
            }
            else {
                dcaMint = (0, umi_1.publicKey)(this.debtMint);
                positionDcaTa = (0, umi_1.publicKey)(this.positionDebtTa);
                signerDcaTa = (0, umi_1.publicKey)(this.signerDebtTa);
            }
            this.livePositionUpdates.new({
                type: "cancellingDca",
                value: this.solautoPositionData.position.dca.tokenType,
            });
        }
        return (0, generated_1.cancelDCA)(this.umi, {
            signer: this.signer,
            solautoPosition: (0, umi_1.publicKey)(this.solautoPosition),
            dcaMint,
            positionDcaTa,
            signerDcaTa,
        });
    }
    protocolInteraction(args) {
        let tx = (0, umi_1.transactionBuilder)();
        if (!this.selfManaged) {
            if (args.__kind === "Deposit") {
                tx = tx.add((0, solanaUtils_1.splTokenTransferUmiIx)(this.signer, this.signerSupplyTa, this.positionSupplyTa, (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey), BigInt(args.fields[0])));
            }
            else if (args.__kind === "Repay") {
                if (args.fields[0].__kind === "Some") {
                    tx = tx.add((0, solanaUtils_1.splTokenTransferUmiIx)(this.signer, this.signerDebtTa, this.positionDebtTa, (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey), BigInt(args.fields[0].fields[0])));
                }
                else {
                    tx = tx.add((0, solanaUtils_1.splTokenTransferUmiIx)(this.signer, this.signerDebtTa, this.positionDebtTa, (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey), BigInt(Math.round(Number(this.solautoPositionState.debt.amountUsed.baseUnit) *
                        1.01))));
                }
            }
        }
        if (args.__kind === "Deposit") {
            this.livePositionUpdates.new({
                type: "supply",
                value: BigInt(args.fields[0]),
            });
        }
        else if (args.__kind === "Withdraw") {
            if (args.fields[0].__kind === "Some") {
                this.livePositionUpdates.new({
                    type: "supply",
                    value: BigInt(args.fields[0].fields[0]) * BigInt(-1),
                });
            }
            else {
                this.livePositionUpdates.new({
                    type: "supply",
                    value: (this.solautoPositionState?.supply.amountUsed.baseUnit ??
                        BigInt(0)) + this.livePositionUpdates.supplyAdjustment,
                });
            }
        }
        else if (args.__kind === "Borrow") {
            this.livePositionUpdates.new({
                type: "debt",
                value: BigInt(args.fields[0]),
            });
        }
        else {
            if (args.fields[0].__kind === "Some") {
                this.livePositionUpdates.new({
                    type: "debt",
                    value: BigInt(args.fields[0].fields[0]) * BigInt(-1),
                });
            }
            else {
                this.livePositionUpdates.new({
                    type: "debt",
                    value: (this.solautoPositionState?.debt.amountUsed.baseUnit ?? BigInt(0)) +
                        this.livePositionUpdates.debtAdjustment,
                });
            }
        }
        return tx;
    }
    async getFreshPositionState() {
        if (Boolean(this.solautoPositionData) &&
            Boolean(this.solautoPositionState) &&
            Number(this.solautoPositionState.lastUpdated) >
                (0, generalUtils_1.currentUnixSeconds)() - solautoConstants_1.MIN_POSITION_STATE_FRESHNESS_SECS &&
            !this.livePositionUpdates.hasUpdates()) {
            return this.solautoPositionState;
        }
        return undefined;
    }
}
exports.SolautoClient = SolautoClient;
