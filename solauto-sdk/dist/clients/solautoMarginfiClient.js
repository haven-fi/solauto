"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolautoMarginfiClient = void 0;
const umi_web3js_adapters_1 = require("@metaplex-foundation/umi-web3js-adapters");
const umi_1 = require("@metaplex-foundation/umi");
const web3_js_1 = require("@solana/web3.js");
const solautoClient_1 = require("./solautoClient");
const marginfiAccounts_1 = require("../constants/marginfiAccounts");
const generated_1 = require("../generated");
const accountUtils_1 = require("../utils/accountUtils");
const generalUtils_1 = require("../utils/generalUtils");
const marginfi_sdk_1 = require("../marginfi-sdk");
const marginfiUtils_1 = require("../utils/marginfiUtils");
const numberUtils_1 = require("../utils/numberUtils");
const utils_1 = require("../utils");
class SolautoMarginfiClient extends solautoClient_1.SolautoClient {
    constructor() {
        super(...arguments);
        this.initialized = false;
        this.marginfiAccountSeedIdx = BigInt(0);
    }
    async initialize(args) {
        await super.initialize(args, generated_1.LendingPlatform.Marginfi);
        if (this.selfManaged) {
            this.marginfiAccount =
                args.marginfiAccount ??
                    (0, umi_1.createSignerFromKeypair)(this.umi, this.umi.eddsa.generateKeypair());
        }
        else {
            this.marginfiAccountSeedIdx = (0, generalUtils_1.generateRandomU64)();
            this.marginfiAccount = this.solautoPositionData
                ? (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.solautoPositionData.position.protocolAccount)
                : await (0, accountUtils_1.getMarginfiAccountPDA)(this.solautoPosition, this.marginfiAccountSeedIdx);
        }
        this.marginfiAccountPk =
            "publicKey" in this.marginfiAccount
                ? (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.marginfiAccount.publicKey)
                : this.marginfiAccount;
        const marginfiAccountData = await (0, marginfi_sdk_1.safeFetchMarginfiAccount)(this.umi, (0, umi_1.publicKey)(this.marginfiAccountPk), { commitment: "confirmed" });
        this.marginfiGroup = new web3_js_1.PublicKey(marginfiAccountData
            ? marginfiAccountData.group.toString()
            : (args.marginfiGroup ?? marginfiAccounts_1.DEFAULT_MARGINFI_GROUP));
        this.marginfiSupplyAccounts =
            marginfiAccounts_1.MARGINFI_ACCOUNTS[this.marginfiGroup.toString()][this.supplyMint.toString()];
        this.marginfiDebtAccounts =
            marginfiAccounts_1.MARGINFI_ACCOUNTS[this.marginfiGroup.toString()][this.debtMint.toString()];
        // TODO: Don't dynamically pull from bank until Marginfi sorts out their price oracle issues.
        // const [supplyBank, debtBank] = await safeFetchAllBank(this.umi, [
        //   publicKey(this.marginfiSupplyAccounts.bank),
        //   publicKey(this.marginfiDebtAccounts.bank),
        // ]);
        // this.supplyPriceOracle = toWeb3JsPublicKey(supplyBank.config.oracleKeys[0]);
        // this.debtPriceOracle = toWeb3JsPublicKey(debtBank.config.oracleKeys[0]);
        this.supplyPriceOracle = new web3_js_1.PublicKey(this.marginfiSupplyAccounts.priceOracle);
        this.debtPriceOracle = new web3_js_1.PublicKey(this.marginfiDebtAccounts.priceOracle);
        if (!this.solautoPositionState) {
            const result = await this.maxLtvAndLiqThresholdBps();
            this.solautoPositionState = (0, utils_1.createFakePositionState)({ mint: this.supplyMint }, { mint: this.debtMint }, result ? result[0] : 0, result ? result[1] : 0);
        }
        if (!this.initialized) {
            await this.setIntermediaryMarginfiDetails();
        }
        this.initialized = true;
    }
    async setIntermediaryMarginfiDetails() {
        const existingMarginfiAccounts = (await (0, marginfiUtils_1.getAllMarginfiAccountsByAuthority)(this.umi, (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey), false))
            .filter((x) => !x.marginfiAccount.equals(this.marginfiAccountPk))
            .sort((a, b) => a.marginfiAccount.toString().localeCompare(b.marginfiAccount.toString()));
        const emptyMarginfiAccounts = existingMarginfiAccounts.length > 0
            ? (await (0, marginfi_sdk_1.safeFetchAllMarginfiAccount)(this.umi, existingMarginfiAccounts.map((x) => (0, umi_1.publicKey)(x.marginfiAccount)))).filter((x) => x.lendingAccount.balances.find((y) => y.bankPk.toString() !== web3_js_1.PublicKey.default.toString() &&
                (Math.round((0, numberUtils_1.bytesToI80F48)(y.assetShares.value)) != 0 ||
                    Math.round((0, numberUtils_1.bytesToI80F48)(y.liabilityShares.value)) != 0)) === undefined)
            : [];
        this.intermediaryMarginfiAccountSigner =
            emptyMarginfiAccounts.length > 0
                ? undefined
                : (0, umi_1.createSignerFromKeypair)(this.umi, this.umi.eddsa.generateKeypair());
        this.intermediaryMarginfiAccountPk =
            emptyMarginfiAccounts.length > 0
                ? (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(emptyMarginfiAccounts[0].publicKey)
                : (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.intermediaryMarginfiAccountSigner.publicKey);
        this.intermediaryMarginfiAccount =
            emptyMarginfiAccounts.length > 0 ? emptyMarginfiAccounts[0] : undefined;
    }
    protocolAccount() {
        return this.marginfiAccountPk;
    }
    defaultLookupTables() {
        return [marginfiAccounts_1.MARGINFI_ACCOUNTS_LOOKUP_TABLE, ...super.defaultLookupTables()];
    }
    lutAccountsToAdd() {
        return [
            ...super.lutAccountsToAdd(),
            this.marginfiAccountPk,
            ...(this.signer.publicKey.toString() === this.authority.toString()
                ? [this.intermediaryMarginfiAccountPk]
                : []),
        ];
    }
    async maxLtvAndLiqThresholdBps() {
        const result = await super.maxLtvAndLiqThresholdBps();
        if (result) {
            return result;
        }
        else if (this.supplyMint.equals(web3_js_1.PublicKey.default) ||
            this.debtMint.equals(web3_js_1.PublicKey.default)) {
            return [0, 0];
        }
        else {
            const [maxLtv, liqThreshold] = await (0, marginfiUtils_1.getMaxLtvAndLiqThreshold)(this.umi, this.marginfiGroup, {
                mint: this.supplyMint,
            }, {
                mint: this.debtMint,
            });
            this.maxLtvBps = (0, numberUtils_1.toBps)(maxLtv);
            this.liqThresholdBps = (0, numberUtils_1.toBps)(liqThreshold);
            return [this.maxLtvBps, this.liqThresholdBps];
        }
    }
    marginfiAccountInitialize() {
        return (0, marginfi_sdk_1.marginfiAccountInitialize)(this.umi, {
            marginfiAccount: this.marginfiAccount,
            marginfiGroup: (0, umi_1.publicKey)(this.marginfiGroup),
            authority: this.signer,
            feePayer: this.signer,
        });
    }
    openPosition(settingParams, dca) {
        return super
            .openPosition(settingParams, dca)
            .add(this.marginfiOpenPositionIx(settingParams, dca));
    }
    marginfiOpenPositionIx(settingParams, dca, positionType) {
        let signerDebtTa = undefined;
        if (dca) {
            signerDebtTa = (0, umi_1.publicKey)(this.signerDebtTa);
        }
        return (0, generated_1.marginfiOpenPosition)(this.umi, {
            signer: this.signer,
            marginfiProgram: (0, umi_1.publicKey)(marginfi_sdk_1.MARGINFI_PROGRAM_ID),
            solautoFeesWallet: (0, umi_1.publicKey)(this.solautoFeesWallet),
            signerReferralState: (0, umi_1.publicKey)(this.referralStateManager.referralState),
            referredByState: this.referredByState
                ? (0, umi_1.publicKey)(this.referredByState)
                : undefined,
            referredBySupplyTa: this.referredBySupplyTa
                ? (0, umi_1.publicKey)(this.referredBySupplyTa)
                : undefined,
            solautoPosition: (0, umi_1.publicKey)(this.solautoPosition),
            marginfiGroup: (0, umi_1.publicKey)(this.marginfiGroup),
            marginfiAccount: "publicKey" in this.marginfiAccount
                ? this.marginfiAccount
                : (0, umi_1.publicKey)(this.marginfiAccount),
            supplyMint: (0, umi_1.publicKey)(this.supplyMint),
            supplyBank: (0, umi_1.publicKey)(this.marginfiSupplyAccounts.bank),
            positionSupplyTa: (0, umi_1.publicKey)(this.positionSupplyTa),
            debtMint: (0, umi_1.publicKey)(this.debtMint),
            debtBank: (0, umi_1.publicKey)(this.marginfiDebtAccounts.bank),
            positionDebtTa: (0, umi_1.publicKey)(this.positionDebtTa),
            signerDebtTa: signerDebtTa,
            positionType: positionType ?? generated_1.PositionType.Leverage,
            positionData: {
                positionId: this.positionId,
                settingParams: settingParams ?? null,
                dca: dca ?? null,
            },
            marginfiAccountSeedIdx: !this.selfManaged
                ? this.marginfiAccountSeedIdx
                : null,
        });
    }
    refresh() {
        return (0, generated_1.marginfiRefreshData)(this.umi, {
            signer: this.signer,
            marginfiProgram: (0, umi_1.publicKey)(marginfi_sdk_1.MARGINFI_PROGRAM_ID),
            marginfiGroup: (0, umi_1.publicKey)(this.marginfiGroup),
            marginfiAccount: (0, umi_1.publicKey)(this.marginfiAccount),
            supplyBank: (0, umi_1.publicKey)(this.marginfiSupplyAccounts.bank),
            supplyPriceOracle: (0, umi_1.publicKey)(this.supplyPriceOracle),
            debtBank: (0, umi_1.publicKey)(this.marginfiDebtAccounts.bank),
            debtPriceOracle: (0, umi_1.publicKey)(this.debtPriceOracle),
            solautoPosition: (0, umi_1.publicKey)(this.solautoPosition),
        });
    }
    protocolInteraction(args) {
        let tx = super.protocolInteraction(args);
        if (this.selfManaged) {
            return tx.add(this.marginfiProtocolInteractionIx(args));
        }
        else {
            return tx.add(this.marginfiSolautoProtocolInteractionIx(args));
        }
    }
    marginfiProtocolInteractionIx(args) {
        switch (args.__kind) {
            case "Deposit": {
                return (0, marginfi_sdk_1.lendingAccountDeposit)(this.umi, {
                    amount: args.fields[0],
                    signer: this.signer,
                    signerTokenAccount: (0, umi_1.publicKey)(this.signerSupplyTa),
                    marginfiAccount: (0, umi_1.publicKey)(this.marginfiAccountPk),
                    marginfiGroup: (0, umi_1.publicKey)(this.marginfiGroup),
                    bank: (0, umi_1.publicKey)(this.marginfiSupplyAccounts.bank),
                    bankLiquidityVault: (0, umi_1.publicKey)(this.marginfiSupplyAccounts.liquidityVault),
                });
            }
            case "Borrow": {
                return (0, marginfi_sdk_1.lendingAccountBorrow)(this.umi, {
                    amount: args.fields[0],
                    signer: this.signer,
                    destinationTokenAccount: (0, umi_1.publicKey)(this.signerDebtTa),
                    marginfiAccount: (0, umi_1.publicKey)(this.marginfiAccountPk),
                    marginfiGroup: (0, umi_1.publicKey)(this.marginfiGroup),
                    bank: (0, umi_1.publicKey)(this.marginfiDebtAccounts.bank),
                    bankLiquidityVault: (0, umi_1.publicKey)(this.marginfiDebtAccounts.liquidityVault),
                    bankLiquidityVaultAuthority: (0, umi_1.publicKey)(this.marginfiDebtAccounts.vaultAuthority),
                });
            }
            case "Repay": {
                return (0, marginfi_sdk_1.lendingAccountRepay)(this.umi, {
                    amount: args.fields[0].__kind === "Some" ? args.fields[0].fields[0] : 0,
                    repayAll: args.fields[0].__kind === "All" ? true : false,
                    signer: this.signer,
                    signerTokenAccount: (0, umi_1.publicKey)(this.signerDebtTa),
                    marginfiAccount: (0, umi_1.publicKey)(this.marginfiAccountPk),
                    marginfiGroup: (0, umi_1.publicKey)(this.marginfiGroup),
                    bank: (0, umi_1.publicKey)(this.marginfiDebtAccounts.bank),
                    bankLiquidityVault: (0, umi_1.publicKey)(this.marginfiDebtAccounts.liquidityVault),
                });
            }
            case "Withdraw": {
                return (0, marginfi_sdk_1.lendingAccountWithdraw)(this.umi, {
                    amount: args.fields[0].__kind === "Some" ? args.fields[0].fields[0] : 0,
                    withdrawAll: args.fields[0].__kind === "All" ? true : false,
                    signer: this.signer,
                    destinationTokenAccount: (0, umi_1.publicKey)(this.signerSupplyTa),
                    marginfiAccount: (0, umi_1.publicKey)(this.marginfiAccountPk),
                    marginfiGroup: (0, umi_1.publicKey)(this.marginfiGroup),
                    bank: (0, umi_1.publicKey)(this.marginfiSupplyAccounts.bank),
                    bankLiquidityVault: (0, umi_1.publicKey)(this.marginfiSupplyAccounts.liquidityVault),
                    bankLiquidityVaultAuthority: (0, umi_1.publicKey)(this.marginfiSupplyAccounts.vaultAuthority),
                });
            }
        }
    }
    marginfiSolautoProtocolInteractionIx(args) {
        let positionSupplyTa = undefined;
        let vaultSupplyTa = undefined;
        let supplyVaultAuthority = undefined;
        if (args.__kind === "Deposit" || args.__kind === "Withdraw") {
            positionSupplyTa = (0, umi_1.publicKey)(args.__kind === "Withdraw" || this.selfManaged
                ? this.signerSupplyTa
                : this.positionSupplyTa);
            vaultSupplyTa = (0, umi_1.publicKey)(this.marginfiSupplyAccounts.liquidityVault);
            supplyVaultAuthority = (0, umi_1.publicKey)(this.marginfiSupplyAccounts.vaultAuthority);
        }
        let positionDebtTa = undefined;
        let vaultDebtTa = undefined;
        let debtVaultAuthority = undefined;
        if (args.__kind === "Borrow" || args.__kind === "Repay") {
            positionDebtTa = (0, umi_1.publicKey)(args.__kind === "Borrow" || this.selfManaged
                ? this.signerDebtTa
                : this.positionDebtTa);
            vaultDebtTa = (0, umi_1.publicKey)(this.marginfiDebtAccounts.liquidityVault);
            debtVaultAuthority = (0, umi_1.publicKey)(this.marginfiDebtAccounts.vaultAuthority);
        }
        let supplyPriceOracle = undefined;
        let debtPriceOracle = undefined;
        if (args.__kind === "Withdraw" || args.__kind === "Borrow") {
            supplyPriceOracle = (0, umi_1.publicKey)(this.supplyPriceOracle);
            debtPriceOracle = (0, umi_1.publicKey)(this.debtPriceOracle);
        }
        return (0, generated_1.marginfiProtocolInteraction)(this.umi, {
            signer: this.signer,
            marginfiProgram: (0, umi_1.publicKey)(marginfi_sdk_1.MARGINFI_PROGRAM_ID),
            solautoPosition: (0, umi_1.publicKey)(this.solautoPosition),
            marginfiGroup: (0, umi_1.publicKey)(this.marginfiGroup),
            marginfiAccount: (0, umi_1.publicKey)(this.marginfiAccountPk),
            supplyBank: (0, umi_1.publicKey)(this.marginfiSupplyAccounts.bank),
            supplyPriceOracle,
            positionSupplyTa,
            vaultSupplyTa,
            supplyVaultAuthority,
            debtBank: (0, umi_1.publicKey)(this.marginfiDebtAccounts.bank),
            debtPriceOracle,
            positionDebtTa,
            vaultDebtTa,
            debtVaultAuthority,
            solautoAction: args,
        });
    }
    rebalance(rebalanceStep, jupQuote, rebalanceType, flashLoan, targetLiqUtilizationRateBps) {
        const inputIsSupply = new web3_js_1.PublicKey(jupQuote.inputMint).equals(this.supplyMint);
        const outputIsSupply = new web3_js_1.PublicKey(jupQuote.outputMint).equals(this.supplyMint);
        const needSupplyAccounts = (inputIsSupply && rebalanceStep === "A") ||
            (outputIsSupply && rebalanceStep === "B") ||
            (inputIsSupply && flashLoan !== undefined && rebalanceStep == "B");
        const needDebtAccounts = (!inputIsSupply && rebalanceStep === "A") ||
            (!outputIsSupply && rebalanceStep === "B") ||
            (!inputIsSupply && flashLoan !== undefined && rebalanceStep == "B");
        return (0, generated_1.marginfiRebalance)(this.umi, {
            signer: this.signer,
            marginfiProgram: (0, umi_1.publicKey)(marginfi_sdk_1.MARGINFI_PROGRAM_ID),
            ixsSysvar: (0, umi_1.publicKey)(web3_js_1.SYSVAR_INSTRUCTIONS_PUBKEY),
            solautoFeesSupplyTa: rebalanceStep === "B" ? (0, umi_1.publicKey)(this.solautoFeesSupplyTa) : undefined,
            authorityReferralState: (0, umi_1.publicKey)(this.referralStateManager.referralState),
            referredBySupplyTa: this.referredBySupplyTa
                ? (0, umi_1.publicKey)(this.referredBySupplyTa)
                : undefined,
            positionAuthority: (0, umi_1.publicKey)(this.authority),
            solautoPosition: (0, umi_1.publicKey)(this.solautoPosition),
            marginfiGroup: (0, umi_1.publicKey)(this.marginfiGroup),
            marginfiAccount: (0, umi_1.publicKey)(this.marginfiAccountPk),
            intermediaryTa: (0, umi_1.publicKey)((0, accountUtils_1.getTokenAccount)((0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey), new web3_js_1.PublicKey(jupQuote.inputMint))),
            supplyBank: (0, umi_1.publicKey)(this.marginfiSupplyAccounts.bank),
            supplyPriceOracle: (0, umi_1.publicKey)(this.supplyPriceOracle),
            positionSupplyTa: (0, umi_1.publicKey)(this.positionSupplyTa),
            authoritySupplyTa: (0, umi_1.publicKey)((0, accountUtils_1.getTokenAccount)(this.authority, this.supplyMint)),
            vaultSupplyTa: needSupplyAccounts
                ? (0, umi_1.publicKey)(this.marginfiSupplyAccounts.liquidityVault)
                : undefined,
            supplyVaultAuthority: needSupplyAccounts
                ? (0, umi_1.publicKey)(this.marginfiSupplyAccounts.vaultAuthority)
                : undefined,
            debtBank: (0, umi_1.publicKey)(this.marginfiDebtAccounts.bank),
            debtPriceOracle: (0, umi_1.publicKey)(this.debtPriceOracle),
            positionDebtTa: (0, umi_1.publicKey)(this.positionDebtTa),
            authorityDebtTa: (0, umi_1.publicKey)((0, accountUtils_1.getTokenAccount)(this.authority, this.debtMint)),
            vaultDebtTa: needDebtAccounts
                ? (0, umi_1.publicKey)(this.marginfiDebtAccounts.liquidityVault)
                : undefined,
            debtVaultAuthority: needDebtAccounts
                ? (0, umi_1.publicKey)(this.marginfiDebtAccounts.vaultAuthority)
                : undefined,
            rebalanceType,
            targetLiqUtilizationRateBps: targetLiqUtilizationRateBps ?? null,
            targetInAmountBaseUnit: rebalanceStep === "A" ? parseInt(jupQuote.inAmount) : null,
        });
    }
    flashBorrow(flashLoanDetails, destinationTokenAccount) {
        const bank = flashLoanDetails.mint.equals(this.supplyMint)
            ? this.marginfiSupplyAccounts
            : this.marginfiDebtAccounts;
        return (0, umi_1.transactionBuilder)()
            .add((0, marginfi_sdk_1.lendingAccountStartFlashloan)(this.umi, {
            endIndex: 0, // We set this after building the transaction
            ixsSysvar: (0, umi_1.publicKey)(web3_js_1.SYSVAR_INSTRUCTIONS_PUBKEY),
            marginfiAccount: (0, umi_1.publicKey)(this.intermediaryMarginfiAccountPk),
            signer: this.signer,
        }))
            .add((0, marginfi_sdk_1.lendingAccountBorrow)(this.umi, {
            amount: flashLoanDetails.baseUnitAmount,
            bank: (0, umi_1.publicKey)(bank.bank),
            bankLiquidityVault: (0, umi_1.publicKey)(bank.liquidityVault),
            bankLiquidityVaultAuthority: (0, umi_1.publicKey)(bank.vaultAuthority),
            destinationTokenAccount: (0, umi_1.publicKey)(destinationTokenAccount),
            marginfiAccount: (0, umi_1.publicKey)(this.intermediaryMarginfiAccountPk),
            marginfiGroup: (0, umi_1.publicKey)(marginfiAccounts_1.DEFAULT_MARGINFI_GROUP),
            signer: this.signer,
        }));
    }
    flashRepay(flashLoanDetails) {
        const accounts = flashLoanDetails.mint.equals(this.supplyMint)
            ? { data: this.marginfiSupplyAccounts, oracle: this.supplyPriceOracle }
            : { data: this.marginfiDebtAccounts, oracle: this.debtPriceOracle };
        const remainingAccounts = [];
        let includedFlashLoanToken = false;
        if (this.intermediaryMarginfiAccount) {
            this.intermediaryMarginfiAccount.lendingAccount.balances.forEach(async (x) => {
                if (x.active) {
                    if (x.bankPk === accounts.data.bank) {
                        includedFlashLoanToken = true;
                    }
                    // TODO: Don't dynamically pull from bank until Marginfi sorts out their price oracle issues.
                    // const bankData = await safeFetchBank(this.umi, publicKey(accounts.data.bank));
                    // const priceOracle = bankData!.config.oracleKeys[0];
                    const priceOracle = (0, umi_1.publicKey)((0, marginfiUtils_1.findMarginfiAccounts)((0, umi_web3js_adapters_1.toWeb3JsPublicKey)(x.bankPk)).priceOracle);
                    remainingAccounts.push(...[
                        {
                            pubkey: x.bankPk,
                            isSigner: false,
                            isWritable: false,
                        },
                        {
                            pubkey: priceOracle,
                            isSigner: false,
                            isWritable: false,
                        },
                    ]);
                }
            });
        }
        if (!this.intermediaryMarginfiAccount || !includedFlashLoanToken) {
            remainingAccounts.push(...[
                {
                    pubkey: (0, umi_web3js_adapters_1.fromWeb3JsPublicKey)(new web3_js_1.PublicKey(accounts.data.bank)),
                    isSigner: false,
                    isWritable: false,
                },
                {
                    pubkey: (0, umi_web3js_adapters_1.fromWeb3JsPublicKey)(new web3_js_1.PublicKey(accounts.oracle)),
                    isSigner: false,
                    isWritable: false,
                },
            ]);
        }
        return (0, umi_1.transactionBuilder)()
            .add((0, marginfi_sdk_1.lendingAccountRepay)(this.umi, {
            amount: flashLoanDetails.baseUnitAmount,
            repayAll: null,
            bank: (0, umi_1.publicKey)(accounts.data.bank),
            bankLiquidityVault: (0, umi_1.publicKey)(accounts.data.liquidityVault),
            marginfiAccount: (0, umi_1.publicKey)(this.intermediaryMarginfiAccountPk),
            marginfiGroup: (0, umi_1.publicKey)(marginfiAccounts_1.DEFAULT_MARGINFI_GROUP),
            signer: this.signer,
            signerTokenAccount: (0, umi_1.publicKey)((0, accountUtils_1.getTokenAccount)((0, umi_web3js_adapters_1.toWeb3JsPublicKey)(this.signer.publicKey), flashLoanDetails.mint)),
        }))
            .add((0, marginfi_sdk_1.lendingAccountEndFlashloan)(this.umi, {
            marginfiAccount: (0, umi_1.publicKey)(this.intermediaryMarginfiAccountPk),
            signer: this.signer,
        }).addRemainingAccounts(remainingAccounts));
    }
    createIntermediaryMarginfiAccount() {
        return (0, marginfi_sdk_1.marginfiAccountInitialize)(this.umi, {
            marginfiAccount: this.intermediaryMarginfiAccountSigner,
            marginfiGroup: (0, umi_1.publicKey)(marginfiAccounts_1.DEFAULT_MARGINFI_GROUP),
            authority: this.signer,
            feePayer: this.signer,
        });
    }
    async getFreshPositionState() {
        const state = await super.getFreshPositionState();
        if (state) {
            return state;
        }
        const freshState = await (0, marginfiUtils_1.getMarginfiAccountPositionState)(this.umi, this.marginfiAccountPk, this.marginfiGroup, !this.selfManaged && this.solautoPositionData === null
            ? this.supplyMint
            : undefined, !this.selfManaged && this.solautoPositionData === null
            ? this.debtMint
            : undefined, this.livePositionUpdates);
        if (freshState) {
            this.log("Fresh state", freshState);
            const supplyPrice = (0, generalUtils_1.safeGetPrice)(freshState?.supply.mint);
            const debtPrice = (0, generalUtils_1.safeGetPrice)(freshState?.debt.mint);
            this.log("Supply price: ", supplyPrice);
            this.log("Debt price: ", debtPrice);
            this.log("Liq threshold bps:", freshState.liqThresholdBps);
            this.log("Liq utilization rate bps:", freshState.liqUtilizationRateBps);
            this.log("Supply USD:", (0, numberUtils_1.fromBaseUnit)(freshState.supply.amountUsed.baseUnit, freshState.supply.decimals) * supplyPrice);
            this.log("Debt USD:", (0, numberUtils_1.fromBaseUnit)(freshState.debt.amountUsed.baseUnit, freshState.debt.decimals) * debtPrice);
        }
        return freshState;
    }
}
exports.SolautoMarginfiClient = SolautoMarginfiClient;
