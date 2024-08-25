"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findMarginfiAccounts = findMarginfiAccounts;
exports.getMaxLtvAndLiqThreshold = getMaxLtvAndLiqThreshold;
exports.getAllMarginfiAccountsByAuthority = getAllMarginfiAccountsByAuthority;
exports.getMarginfiAccountPositionState = getMarginfiAccountPositionState;
exports.getUpToDateShareValues = getUpToDateShareValues;
const web3_js_1 = require("@solana/web3.js");
const umi_1 = require("@metaplex-foundation/umi");
const umi_web3js_adapters_1 = require("@metaplex-foundation/umi-web3js-adapters");
const marginfi_sdk_1 = require("../marginfi-sdk");
const generalUtils_1 = require("./generalUtils");
const numberUtils_1 = require("./numberUtils");
const solautoConstants_1 = require("../constants/solautoConstants");
const marginfiAccounts_1 = require("../constants/marginfiAccounts");
const generalAccounts_1 = require("../constants/generalAccounts");
const solanaUtils_1 = require("./solanaUtils");
function findMarginfiAccounts(bank) {
    for (const key in marginfiAccounts_1.MARGINFI_ACCOUNTS) {
        const account = marginfiAccounts_1.MARGINFI_ACCOUNTS[key];
        if (account.bank.toString().toLowerCase() === bank.toString().toLowerCase()) {
            return account;
        }
    }
    throw new Error(`Marginfi accounts not found by the bank: ${bank}`);
}
async function getMaxLtvAndLiqThreshold(umi, supply, debt, supplyPrice) {
    if (!supply.bank || supply.bank === null) {
        supply.bank = await (0, marginfi_sdk_1.safeFetchBank)(umi, (0, umi_1.publicKey)(marginfiAccounts_1.MARGINFI_ACCOUNTS[supply.mint.toString()].bank));
    }
    if ((!debt.bank || debt.bank === null) &&
        !debt.mint.equals(web3_js_1.PublicKey.default)) {
        debt.bank = await (0, marginfi_sdk_1.safeFetchBank)(umi, (0, umi_1.publicKey)(marginfiAccounts_1.MARGINFI_ACCOUNTS[debt.mint.toString()].bank));
    }
    if (!supplyPrice) {
        const [price] = await (0, generalUtils_1.getTokenPrices)([
            (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(supply.bank.mint),
        ]);
        supplyPrice = price;
    }
    if (!debt.bank || debt.bank === null) {
        return [0, 0];
    }
    let maxLtv = (0, numberUtils_1.bytesToI80F48)(supply.bank.config.assetWeightInit.value) /
        (0, numberUtils_1.bytesToI80F48)(debt.bank.config.liabilityWeightInit.value);
    const liqThreshold = (0, numberUtils_1.bytesToI80F48)(supply.bank.config.assetWeightMaint.value) /
        (0, numberUtils_1.bytesToI80F48)(debt.bank.config.liabilityWeightMaint.value);
    const totalDepositedUsdValue = (0, numberUtils_1.fromBaseUnit)(BigInt(Math.round((0, numberUtils_1.bytesToI80F48)(supply.bank.totalAssetShares.value) *
        (0, numberUtils_1.bytesToI80F48)(supply.bank.assetShareValue.value))), supply.bank.mintDecimals) * supplyPrice;
    if (supply.bank.config.totalAssetValueInitLimit !== BigInt(0) &&
        totalDepositedUsdValue > supply.bank.config.totalAssetValueInitLimit) {
        const discount = Number(supply.bank.config.totalAssetValueInitLimit) /
            totalDepositedUsdValue;
        maxLtv = Math.round(maxLtv * Number(discount));
    }
    return [maxLtv, liqThreshold];
}
async function getAllMarginfiAccountsByAuthority(umi, authority, compatibleWithSolauto) {
    const marginfiAccounts = await umi.rpc.getProgramAccounts(marginfi_sdk_1.MARGINFI_PROGRAM_ID, {
        commitment: "finalized",
        dataSlice: {
            offset: 0,
            length: 0,
        },
        filters: [
            {
                dataSize: (0, marginfi_sdk_1.getMarginfiAccountSize)(),
            },
            {
                memcmp: {
                    bytes: new Uint8Array(authority.toBuffer()),
                    offset: 40, // Anchor account discriminator + group pubkey
                },
            },
        ],
    });
    if (compatibleWithSolauto) {
        const positionStates = await Promise.all(marginfiAccounts.map(async (x) => ({
            publicKey: x.publicKey,
            state: await getMarginfiAccountPositionState(umi, (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(x.publicKey)),
        })));
        return positionStates
            .filter((x) => x.state !== undefined)
            .map((x) => ({
            marginfiAccount: (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(x.publicKey),
            supplyMint: (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(x.state.supply.mint),
            debtMint: (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(x.state.debt.mint),
        }));
    }
    else {
        return marginfiAccounts.map((x) => ({
            marginfiAccount: (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(x.publicKey),
        }));
    }
}
async function getTokenUsage(umi, bank, isAsset, shares, amountUsedAdjustment) {
    let amountUsed = 0;
    let amountCanBeUsed = 0;
    let marketPrice = 0;
    if (bank !== null) {
        [marketPrice] = await (0, generalUtils_1.getTokenPrices)([(0, umi_web3js_adapters_1.toWeb3JsPublicKey)(bank.mint)]);
        const [assetShareValue, liabilityShareValue] = await getUpToDateShareValues(umi, bank);
        const shareValue = isAsset ? assetShareValue : liabilityShareValue;
        amountUsed = shares * shareValue + Number(amountUsedAdjustment ?? 0);
        const totalDeposited = (0, numberUtils_1.bytesToI80F48)(bank.totalAssetShares.value) * assetShareValue;
        amountCanBeUsed = isAsset
            ? Number(bank.config.depositLimit) - totalDeposited
            : totalDeposited -
                (0, numberUtils_1.bytesToI80F48)(bank.totalLiabilityShares.value) * liabilityShareValue;
    }
    return {
        mint: bank?.mint ?? (0, umi_1.publicKey)(web3_js_1.PublicKey.default),
        decimals: bank?.mintDecimals ?? 0,
        amountUsed: {
            baseUnit: BigInt(Math.round(amountUsed)),
            baseAmountUsdValue: bank
                ? (0, numberUtils_1.toBaseUnit)((0, numberUtils_1.fromBaseUnit)(BigInt(Math.round(amountUsed)), bank.mintDecimals) *
                    marketPrice, generalAccounts_1.USD_DECIMALS)
                : BigInt(0),
        },
        amountCanBeUsed: {
            baseUnit: BigInt(Math.round(amountCanBeUsed)),
            baseAmountUsdValue: bank
                ? (0, numberUtils_1.toBaseUnit)((0, numberUtils_1.fromBaseUnit)(BigInt(Math.round(amountCanBeUsed)), bank.mintDecimals) * marketPrice, generalAccounts_1.USD_DECIMALS)
                : BigInt(0),
        },
        baseAmountMarketPriceUsd: (0, numberUtils_1.toBaseUnit)(marketPrice, generalAccounts_1.USD_DECIMALS),
        flashLoanFeeBps: 0,
        borrowFeeBps: 0,
        padding1: [],
        padding2: [],
        padding: new Uint8Array([]),
    };
}
async function getMarginfiAccountPositionState(umi, marginfiAccountPk, supplyMint, debtMint, livePositionUpdates) {
    let marginfiAccount = await (0, marginfi_sdk_1.safeFetchMarginfiAccount)(umi, (0, umi_1.publicKey)(marginfiAccountPk));
    let supplyBank = supplyMint && supplyMint !== web3_js_1.PublicKey.default
        ? await (0, marginfi_sdk_1.safeFetchBank)(umi, (0, umi_1.publicKey)(marginfiAccounts_1.MARGINFI_ACCOUNTS[supplyMint.toString()].bank))
        : null;
    let debtBank = debtMint && debtMint !== web3_js_1.PublicKey.default
        ? await (0, marginfi_sdk_1.safeFetchBank)(umi, (0, umi_1.publicKey)(marginfiAccounts_1.MARGINFI_ACCOUNTS[debtMint.toString()].bank))
        : null;
    let supplyUsage = undefined;
    let debtUsage = undefined;
    if (marginfiAccount !== null &&
        marginfiAccount.lendingAccount.balances.filter((x) => x.active).length > 0) {
        const supplyBalances = marginfiAccount.lendingAccount.balances.filter((balance) => balance.active && (0, numberUtils_1.bytesToI80F48)(balance.assetShares.value) > 0);
        const debtBalances = marginfiAccount.lendingAccount.balances.filter((balance) => balance.active && (0, numberUtils_1.bytesToI80F48)(balance.liabilityShares.value) > 0);
        if (supplyBalances.length > 1 || debtBalances.length > 1) {
            // Not compatible with Solauto
            return undefined;
        }
        if (supplyBalances.length > 0) {
            if (supplyBank === null) {
                supplyBank = await (0, marginfi_sdk_1.safeFetchBank)(umi, supplyBalances[0].bankPk);
            }
            if (!supplyMint) {
                supplyMint = (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(supplyBank.mint);
            }
            supplyUsage = await getTokenUsage(umi, supplyBank, true, (0, numberUtils_1.bytesToI80F48)(supplyBalances[0].assetShares.value), livePositionUpdates?.supplyAdjustment);
        }
        if (debtBalances.length > 0) {
            if (debtBank === null) {
                debtBank = await (0, marginfi_sdk_1.safeFetchBank)(umi, debtBalances[0].bankPk);
            }
            if (!debtMint) {
                debtMint = (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(debtBank.mint);
            }
            debtUsage = await getTokenUsage(umi, debtBank, false, (0, numberUtils_1.bytesToI80F48)(debtBalances[0].liabilityShares.value), livePositionUpdates?.debtAdjustment);
        }
    }
    if (supplyBank === null) {
        return undefined;
    }
    if (!supplyUsage) {
        supplyUsage = await getTokenUsage(umi, supplyBank, true, 0, livePositionUpdates?.supplyAdjustment);
    }
    if (!debtUsage) {
        debtUsage = await getTokenUsage(umi, debtBank, false, 0, livePositionUpdates?.debtAdjustment);
    }
    const supplyPrice = solautoConstants_1.PRICES[supplyMint.toString()].price;
    let [maxLtv, liqThreshold] = await getMaxLtvAndLiqThreshold(umi, {
        mint: (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(supplyBank.mint),
        bank: supplyBank,
    }, {
        mint: debtBank ? (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(debtBank.mint) : web3_js_1.PublicKey.default,
        bank: debtBank,
    }, supplyPrice);
    const supplyUsd = (0, numberUtils_1.fromBaseUnit)(supplyUsage.amountUsed.baseAmountUsdValue, generalAccounts_1.USD_DECIMALS);
    const debtUsd = (0, numberUtils_1.fromBaseUnit)(debtUsage?.amountUsed?.baseAmountUsdValue ?? BigInt(0), generalAccounts_1.USD_DECIMALS);
    return {
        liqUtilizationRateBps: (0, numberUtils_1.getLiqUtilzationRateBps)(supplyUsd, debtUsd, (0, numberUtils_1.toBps)(liqThreshold)),
        netWorth: {
            baseAmountUsdValue: (0, numberUtils_1.toBaseUnit)(supplyUsd - debtUsd, generalAccounts_1.USD_DECIMALS),
            baseUnit: (0, numberUtils_1.toBaseUnit)((supplyUsd - debtUsd) / supplyPrice, supplyUsage.decimals),
        },
        supply: supplyUsage,
        debt: debtUsage,
        maxLtvBps: (0, numberUtils_1.toBps)(maxLtv),
        liqThresholdBps: (0, numberUtils_1.toBps)(liqThreshold),
        lastUpdated: BigInt((0, generalUtils_1.currentUnixSeconds)()),
        padding1: [],
        padding2: [],
        padding: [],
    };
}
function marginfiInterestRateCurve(bank, utilizationRatio) {
    const optimalUr = (0, numberUtils_1.bytesToI80F48)(bank.config.interestRateConfig.optimalUtilizationRate.value);
    const plateauIr = (0, numberUtils_1.bytesToI80F48)(bank.config.interestRateConfig.plateauInterestRate.value);
    const maxIr = (0, numberUtils_1.bytesToI80F48)(bank.config.interestRateConfig.maxInterestRate.value);
    if (utilizationRatio <= optimalUr) {
        return (utilizationRatio / optimalUr) * plateauIr;
    }
    else {
        return (((utilizationRatio - optimalUr) / (1 - optimalUr)) * (maxIr - plateauIr) +
            plateauIr);
    }
}
function calcInterestRate(bank, utilizationRatio) {
    const baseRate = marginfiInterestRateCurve(bank, utilizationRatio);
    const lendingRate = baseRate * utilizationRatio;
    const protocolIrFee = (0, numberUtils_1.bytesToI80F48)(bank.config.interestRateConfig.protocolIrFee.value);
    const insuranceIrFee = (0, numberUtils_1.bytesToI80F48)(bank.config.interestRateConfig.insuranceIrFee.value);
    const protocolFixedFeeApr = (0, numberUtils_1.bytesToI80F48)(bank.config.interestRateConfig.protocolFixedFeeApr.value);
    const insuranceFixedFeeApr = (0, numberUtils_1.bytesToI80F48)(bank.config.interestRateConfig.insuranceFeeFixedApr.value);
    const rateFee = protocolIrFee + insuranceIrFee;
    const totalFixedFeeApr = protocolFixedFeeApr + insuranceFixedFeeApr;
    const borrowingRate = baseRate * (1 + rateFee) * totalFixedFeeApr;
    return [lendingRate, borrowingRate];
}
function calcAccruedInterestPaymentPerPeriod(apr, timeDelta, shareValue) {
    const irPerPeriod = (apr * timeDelta) / 31536000; // Seconds per year
    const newValue = shareValue * (1 + irPerPeriod);
    return newValue;
}
async function getUpToDateShareValues(umi, bank) {
    const currentTime = await (0, solanaUtils_1.currentUnixSecondsSolana)(umi);
    let timeDelta = currentTime - Number(bank.lastUpdate);
    const totalAssets = (0, numberUtils_1.bytesToI80F48)(bank.totalAssetShares.value) *
        (0, numberUtils_1.bytesToI80F48)(bank.assetShareValue.value);
    const totalLiabilities = (0, numberUtils_1.bytesToI80F48)(bank.totalLiabilityShares.value) *
        (0, numberUtils_1.bytesToI80F48)(bank.liabilityShareValue.value);
    const utilizationRatio = totalLiabilities / totalAssets;
    const [lendingApr, borrowingApr] = calcInterestRate(bank, utilizationRatio);
    return [
        calcAccruedInterestPaymentPerPeriod(lendingApr, timeDelta, (0, numberUtils_1.bytesToI80F48)(bank.assetShareValue.value)),
        calcAccruedInterestPaymentPerPeriod(borrowingApr, timeDelta, (0, numberUtils_1.bytesToI80F48)(bank.liabilityShareValue.value)),
    ];
}
