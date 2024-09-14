"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolautoClient = void 0;
require("rpc-websockets/dist/lib/client");
const web3_js_1 = require("@solana/web3.js");
const umi_1 = require("@metaplex-foundation/umi");
const umi_web3js_adapters_1 = require("@metaplex-foundation/umi-web3js-adapters");
const umi_signer_wallet_adapters_1 = require("@metaplex-foundation/umi-signer-wallet-adapters");
const generated_1 = require("../generated");
const accountUtils_1 = require("../utils/accountUtils");
const generalAccounts_1 = require("../constants/generalAccounts");
const solanaUtils_1 = require("../utils/solanaUtils");
const solautoConstants_1 = require("../constants/solautoConstants");
const generalUtils_1 = require("../utils/generalUtils");
const generalUtils_2 = require("../utils/solauto/generalUtils");
const referralStateManager_1 = require("./referralStateManager");
const txHandler_1 = require("./txHandler");
class SolautoClient extends txHandler_1.TxHandler {
    constructor(heliusApiKey, localTest) {
        super(heliusApiKey, localTest);
        this.localTest = localTest;
        this.livePositionUpdates = new generalUtils_2.LivePositionUpdates();
        this.umi = this.umi.use({
            install(umi) {
                umi.programs.add((0, generated_1.createSolautoProgram)(), false);
            },
        });
    }
    async initialize(args, lendingPlatform) {
        if (!args.signer && !args.wallet) {
            throw new Error("Signer or wallet must be provided");
        }
        this.umi = this.umi.use(args.signer
            ? (0, umi_1.signerIdentity)(args.signer)
            : (0, umi_signer_wallet_adapters_1.walletAdapterIdentity)(args.wallet, true));
        this.signer = this.umi.identity;
        this.authority = args.authority ?? (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey);
        this.positionId = args.positionId ?? 0;
        this.selfManaged = this.positionId === 0;
        this.lendingPlatform = lendingPlatform;
        this.solautoPosition = (0, accountUtils_1.getSolautoPositionAccount)(this.authority, this.positionId);
        this.solautoPositionData = await (0, generated_1.safeFetchSolautoPosition)(this.umi, (0, umi_1.publicKey)(this.solautoPosition));
        this.solautoPositionState = this.solautoPositionData?.state;
        this.supplyMint =
            args.supplyMint ??
                (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.solautoPositionData.position.supplyMint);
        this.positionSupplyTa = (0, accountUtils_1.getTokenAccount)(this.solautoPosition, this.supplyMint);
        this.signerSupplyTa = (0, accountUtils_1.getTokenAccount)((0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey), this.supplyMint);
        this.debtMint =
            args.debtMint ??
                (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.solautoPositionData.position.debtMint);
        this.positionDebtTa = (0, accountUtils_1.getTokenAccount)(this.solautoPosition, this.debtMint);
        this.signerDebtTa = (0, accountUtils_1.getTokenAccount)((0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey), this.debtMint);
        this.referralStateManager = new referralStateManager_1.ReferralStateManager(this.heliusApiKey);
        await this.referralStateManager.initialize({
            referralAuthority: this.authority,
            signer: args.signer,
            wallet: args.wallet
        });
        const authorityReferralStateData = this.referralStateManager.referralStateData;
        const hasReferredBy = authorityReferralStateData &&
            authorityReferralStateData.referredByState !==
                (0, umi_1.publicKey)(web3_js_1.PublicKey.default);
        const referredByAuthority = !hasReferredBy &&
            args.referredByAuthority &&
            !args.referredByAuthority.equals((0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey))
            ? args.referredByAuthority
            : undefined;
        this.referredByState = hasReferredBy
            ? (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(authorityReferralStateData.referredByState)
            : referredByAuthority
                ? (0, accountUtils_1.getReferralState)(referredByAuthority)
                : undefined;
        this.referredByAuthority = referredByAuthority;
        if (this.referredByState !== undefined) {
            this.referredBySupplyTa = (0, accountUtils_1.getTokenAccount)(this.referredByState, this.supplyMint);
        }
        this.solautoFeesWallet = generalAccounts_1.SOLAUTO_FEES_WALLET;
        this.solautoFeesSupplyTa = (0, accountUtils_1.getTokenAccount)(this.solautoFeesWallet, this.supplyMint);
        this.authorityLutAddress = authorityReferralStateData?.lookupTable && !(0, umi_web3js_adapters_1.toWeb3JsPublicKey)(authorityReferralStateData.lookupTable).equals(web3_js_1.PublicKey.default)
            ? (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(authorityReferralStateData?.lookupTable)
            : undefined;
        this.upToDateLutAccounts = (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey).equals(this.authority)
            ? await this.fetchExistingAuthorityLutAccounts()
            : [];
        this.log("Position state: ", this.solautoPositionState);
        this.log("Position settings: ", this.solautoPositionData?.position?.settingParams);
        this.log("Position DCA: ", (this.solautoPositionData?.position?.dca?.automation?.targetPeriods ??
            0) > 0
            ? this.solautoPositionData?.position?.dca
            : undefined);
    }
    async resetLiveTxUpdates() {
        if (!this.solautoPositionData) {
            this.solautoPositionData = await (0, generated_1.safeFetchSolautoPosition)(this.umi, (0, umi_1.publicKey)(this.solautoPosition));
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
        this.livePositionUpdates.reset();
    }
    defaultLookupTables() {
        return [solautoConstants_1.SOLAUTO_LUT, ...(this.authorityLutAddress ? [this.authorityLutAddress.toString()] : [])];
    }
    lutAccountsToAdd() {
        return [
            this.authority,
            ...(this.signer.publicKey.toString() === this.authority.toString()
                ? [this.signerSupplyTa]
                : []),
            ...(this.signer.publicKey.toString() === this.authority.toString()
                ? [this.signerDebtTa]
                : []),
            this.solautoPosition,
            this.positionSupplyTa,
            this.positionDebtTa,
            this.referralStateManager.referralState,
            ...(this.referredBySupplyTa ? [this.referredBySupplyTa] : []),
        ];
    }
    async fetchExistingAuthorityLutAccounts() {
        const lookupTable = this.authorityLutAddress
            ? await this.connection.getAddressLookupTable(this.authorityLutAddress)
            : null;
        if (lookupTable === null) {
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
        this.upToDateLutAccounts = [...existingLutAccounts, ...accountsToAdd];
        if (accountsToAdd.length > 0) {
            tx = tx.add((0, solanaUtils_1.getWrappedInstruction)(this.signer, web3_js_1.AddressLookupTableProgram.extendLookupTable({
                payer: (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey),
                authority: this.authority,
                lookupTable: this.authorityLutAddress,
                addresses: accountsToAdd,
            })));
        }
        const addingReferredBy = accountsToAdd.length === 1 &&
            accountsToAdd[0].toString().toLowerCase() ===
                this.referredBySupplyTa?.toString().toLowerCase();
        if (tx.getInstructions().length > 0) {
            this.log("Updating authority lookup table...");
        }
        return { updateLutTx: tx, needsToBeIsolated: !addingReferredBy };
    }
    solautoPositionSettings() {
        return (this.livePositionUpdates.settings ??
            this.solautoPositionData?.position.settingParams);
    }
    solautoPositionActiveDca() {
        return (this.livePositionUpdates.activeDca ??
            this.solautoPositionData?.position.dca);
    }
    openPosition(settingParams, dca) {
        if (dca && dca.debtToAddBaseUnit > 0) {
            this.livePositionUpdates.new({
                type: "debtDcaIn",
                value: BigInt(dca.debtToAddBaseUnit),
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
        let debtMint = undefined;
        let positionDebtTa = undefined;
        let signerDebtTa = undefined;
        if ((0, umi_1.isOption)(args.dca) && (0, umi_1.isSome)(args.dca)) {
            debtMint = (0, umi_1.publicKey)(this.debtMint);
            positionDebtTa = (0, umi_1.publicKey)(this.positionDebtTa);
            signerDebtTa = (0, umi_1.publicKey)(this.signerDebtTa);
            let addingToPos = false;
            if ((0, umi_1.isOption)(args.dca) &&
                (0, umi_1.isSome)(args.dca) &&
                args.dca.value.debtToAddBaseUnit > 0) {
                this.livePositionUpdates.new({
                    type: "debtDcaIn",
                    value: BigInt(args.dca.value.debtToAddBaseUnit),
                });
                addingToPos = true;
            }
            if (this.solautoPositionData?.position.dca.debtToAddBaseUnit &&
                !addingToPos) {
                this.livePositionUpdates.new({
                    type: "debtDcaIn",
                    value: this.solautoPositionData.position.dca.debtToAddBaseUnit *
                        BigInt(-1),
                });
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
            debtMint,
            positionDebtTa,
            signerDebtTa,
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
        });
    }
    cancelDCAIx() {
        let debtMint = undefined;
        let positionDebtTa = undefined;
        let signerDebtTa = undefined;
        if (this.solautoPositionData !== null && !this.selfManaged) {
            const positionData = this.solautoPositionData.position;
            if (positionData.dca.debtToAddBaseUnit) {
                debtMint = (0, umi_1.publicKey)(this.debtMint);
                positionDebtTa = (0, umi_1.publicKey)(this.positionDebtTa);
                signerDebtTa = (0, umi_1.publicKey)(this.signerDebtTa);
                this.livePositionUpdates.new({
                    type: "debtDcaIn",
                    value: positionData.dca.debtToAddBaseUnit * BigInt(-1),
                });
            }
        }
        return (0, generated_1.cancelDCA)(this.umi, {
            signer: this.signer,
            solautoPosition: (0, umi_1.publicKey)(this.solautoPosition),
            debtMint,
            positionDebtTa,
            signerDebtTa,
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
