"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRebalanceValues = getRebalanceValues;
exports.getFlashLoanDetails = getFlashLoanDetails;
exports.getJupSwapRebalanceDetails = getJupSwapRebalanceDetails;
const generated_1 = require("../../generated");
const generalUtils_1 = require("./generalUtils");
const umi_web3js_adapters_1 = require("@metaplex-foundation/umi-web3js-adapters");
const generalUtils_2 = require("../generalUtils");
const numberUtils_1 = require("../numberUtils");
const generalAccounts_1 = require("../../constants/generalAccounts");
const solautoConstants_1 = require("../../constants/solautoConstants");
function getAdditionalAmountToDcaIn(dca) {
    if (dca.dcaInBaseUnit === BigInt(0)) {
        return 0;
    }
    const debtBalance = Number(dca.dcaInBaseUnit);
    const updatedDebtBalance = (0, generalUtils_1.getUpdatedValueFromAutomation)(debtBalance, 0, dca.automation, (0, generalUtils_2.currentUnixSeconds)());
    return debtBalance - updatedDebtBalance;
}
function getStandardTargetLiqUtilizationRateBps(state, settings) {
    const adjustedSettings = (0, generalUtils_1.getAdjustedSettingsFromAutomation)(settings, (0, generalUtils_2.currentUnixSeconds)());
    const repayFrom = settings.repayToBps + settings.repayGap;
    const boostFrom = adjustedSettings.boostToBps - settings.boostGap;
    if (state.liqUtilizationRateBps <= boostFrom) {
        return adjustedSettings.boostToBps;
    }
    else if (state.liqUtilizationRateBps >= repayFrom) {
        return adjustedSettings.repayToBps;
    }
    else {
        throw new Error("Invalid rebalance condition");
    }
}
function targetLiqUtilizationRateBpsFromDCA(state, settings, dca, currentUnixTime) {
    const adjustedSettings = (0, generalUtils_1.getAdjustedSettingsFromAutomation)(settings, currentUnixTime);
    let targetRateBps = 0;
    if (dca.dcaInBaseUnit > BigInt(0)) {
        targetRateBps = Math.max(state.liqUtilizationRateBps, adjustedSettings.boostToBps);
    }
    else {
        targetRateBps = adjustedSettings.boostToBps;
    }
    return targetRateBps;
}
function isDcaRebalance(state, settings, dca, currentUnixTime) {
    if (dca === undefined || dca.automation.targetPeriods === 0) {
        return false;
    }
    const adjustedSettings = (0, generalUtils_1.getAdjustedSettingsFromAutomation)(settings, currentUnixTime);
    if (state.liqUtilizationRateBps >
        adjustedSettings.repayToBps + adjustedSettings.repayGap) {
        return false;
    }
    if (!(0, generalUtils_1.eligibleForNextAutomationPeriod)(dca.automation, currentUnixTime)) {
        return false;
    }
    return true;
}
function getTargetRateAndDcaAmount(state, settings, dca, currentUnixTime, targetLiqUtilizationRateBps) {
    if (targetLiqUtilizationRateBps !== undefined) {
        return {
            targetRateBps: targetLiqUtilizationRateBps,
        };
    }
    if (settings === undefined) {
        throw new Error("If rebalancing a self-managed position, settings and DCA should be provided");
    }
    if (isDcaRebalance(state, settings, dca, currentUnixTime)) {
        const amountToDcaIn = getAdditionalAmountToDcaIn(dca);
        const targetLiqUtilizationRateBps = targetLiqUtilizationRateBpsFromDCA(state, settings, dca, currentUnixTime);
        return {
            targetRateBps: targetLiqUtilizationRateBps,
            amountToDcaIn,
        };
    }
    else {
        return {
            targetRateBps: getStandardTargetLiqUtilizationRateBps(state, settings),
        };
    }
}
function getRebalanceValues(state, settings, dca, currentUnixTime, supplyPrice, debtPrice, targetLiqUtilizationRateBps, limitGapBps) {
    const { targetRateBps, amountToDcaIn } = getTargetRateAndDcaAmount(state, settings, dca, currentUnixTime, targetLiqUtilizationRateBps);
    const amountUsdToDcaIn = (0, numberUtils_1.fromBaseUnit)(BigInt(Math.round(amountToDcaIn ?? 0)), state.debt.decimals) *
        debtPrice;
    const increasingLeverage = amountUsdToDcaIn > 0 || state.liqUtilizationRateBps < targetRateBps;
    let adjustmentFeeBps = 0;
    if (increasingLeverage) {
        adjustmentFeeBps = (0, numberUtils_1.getSolautoFeesBps)(false, targetLiqUtilizationRateBps, (0, numberUtils_1.fromBaseUnit)(state.netWorth.baseAmountUsdValue, generalAccounts_1.USD_DECIMALS)).total;
    }
    const supplyUsd = (0, numberUtils_1.fromBaseUnit)(state.supply.amountUsed.baseAmountUsdValue, generalAccounts_1.USD_DECIMALS) +
        amountUsdToDcaIn;
    const debtUsd = (0, numberUtils_1.fromBaseUnit)(state.debt.amountUsed.baseAmountUsdValue, generalAccounts_1.USD_DECIMALS);
    let debtAdjustmentUsd = (0, numberUtils_1.getDebtAdjustmentUsd)(state.liqThresholdBps, supplyUsd, debtUsd, targetRateBps, adjustmentFeeBps);
    const input = increasingLeverage ? state.debt : state.supply;
    const inputMarketPrice = increasingLeverage ? debtPrice : supplyPrice;
    const limitGap = limitGapBps
        ? (0, numberUtils_1.fromBps)(limitGapBps)
        : (0, numberUtils_1.fromBps)(solautoConstants_1.DEFAULT_LIMIT_GAP_BPS);
    if (debtAdjustmentUsd > 0 &&
        (0, numberUtils_1.toBaseUnit)(debtAdjustmentUsd / inputMarketPrice, input.decimals) >
            input.amountCanBeUsed.baseUnit) {
        const maxUsageUsd = (0, numberUtils_1.fromBaseUnit)(input.amountCanBeUsed.baseUnit, input.decimals) *
            inputMarketPrice *
            limitGap;
        debtAdjustmentUsd = maxUsageUsd - maxUsageUsd * limitGap;
    }
    const maxRepayTo = (0, numberUtils_1.maxRepayToBps)(state.maxLtvBps, state.liqThresholdBps);
    return {
        increasingLeverage,
        debtAdjustmentUsd,
        repayingCloseToMaxLtv: state.liqUtilizationRateBps > maxRepayTo && targetRateBps >= maxRepayTo,
        amountToDcaIn: amountToDcaIn ?? 0,
        amountUsdToDcaIn,
        dcaTokenType: dca?.tokenType,
    };
}
function getFlashLoanDetails(client, values, jupQuote, priceImpactBps) {
    let supplyUsd = (0, numberUtils_1.fromBaseUnit)(client.solautoPositionState.supply.amountUsed.baseAmountUsdValue, generalAccounts_1.USD_DECIMALS) +
        (values.dcaTokenType === generated_1.TokenType.Supply ? values.amountUsdToDcaIn : 0);
    let debtUsd = (0, numberUtils_1.fromBaseUnit)(client.solautoPositionState.debt.amountUsed.baseAmountUsdValue, generalAccounts_1.USD_DECIMALS);
    const debtAdjustmentWithSlippage = Math.abs(values.debtAdjustmentUsd) +
        Math.abs(values.debtAdjustmentUsd) * (0, numberUtils_1.fromBps)(priceImpactBps);
    supplyUsd =
        values.debtAdjustmentUsd < 0
            ? supplyUsd - debtAdjustmentWithSlippage
            : supplyUsd;
    debtUsd =
        values.debtAdjustmentUsd > 0
            ? debtUsd + debtAdjustmentWithSlippage
            : debtUsd;
    const tempLiqUtilizationRateBps = (0, numberUtils_1.getLiqUtilzationRateBps)(supplyUsd, debtUsd, client.solautoPositionState.liqThresholdBps);
    const requiresFlashLoan = supplyUsd <= 0 ||
        tempLiqUtilizationRateBps >
            (0, numberUtils_1.getMaxLiqUtilizationRateBps)(client.solautoPositionState.maxLtvBps, client.solautoPositionState.liqThresholdBps, 0.01);
    let flashLoanToken = undefined;
    let flashLoanTokenPrice = 0;
    if (values.increasingLeverage) {
        flashLoanToken = client.solautoPositionState.debt;
        flashLoanTokenPrice = (0, generalUtils_2.safeGetPrice)(client.debtMint);
    }
    else {
        flashLoanToken = client.solautoPositionState.supply;
        flashLoanTokenPrice = (0, generalUtils_2.safeGetPrice)(client.supplyMint);
    }
    const exactAmountBaseUnit = jupQuote.swapMode === "ExactOut" || jupQuote.swapMode === "ExactIn"
        ? BigInt(parseInt(jupQuote.inAmount))
        : undefined;
    return requiresFlashLoan
        ? {
            baseUnitAmount: exactAmountBaseUnit
                ? exactAmountBaseUnit
                : (0, numberUtils_1.toBaseUnit)(debtAdjustmentWithSlippage / flashLoanTokenPrice, flashLoanToken.decimals),
            mint: (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(flashLoanToken.mint),
        }
        : undefined;
}
function getJupSwapRebalanceDetails(client, values, targetLiqUtilizationRateBps, attemptNum) {
    const input = values.increasingLeverage
        ? client.solautoPositionState.debt
        : client.solautoPositionState.supply;
    const output = values.increasingLeverage
        ? client.solautoPositionState.supply
        : client.solautoPositionState.debt;
    const usdToSwap = Math.abs(values.debtAdjustmentUsd) +
        (values.dcaTokenType === generated_1.TokenType.Debt ? values.amountUsdToDcaIn : 0);
    const inputAmount = (0, numberUtils_1.toBaseUnit)(usdToSwap / (0, generalUtils_2.safeGetPrice)(input.mint), input.decimals);
    const outputAmount = (0, numberUtils_1.toBaseUnit)(usdToSwap / (0, generalUtils_2.safeGetPrice)(output.mint), output.decimals);
    const exactOut = values.repayingCloseToMaxLtv;
    const exactIn = !exactOut && targetLiqUtilizationRateBps !== undefined;
    return {
        inputMint: (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(input.mint),
        outputMint: (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(output.mint),
        destinationWallet: client.solautoPosition,
        slippageIncFactor: 0.5 + (attemptNum ?? 0) * 0.2,
        amount: exactOut
            ? outputAmount +
                (targetLiqUtilizationRateBps === 0
                    ? BigInt(Math.round(Number(client.solautoPositionState.debt.amountUsed.baseUnit) *
                        // Add this small percentage to account for the APR on the debt between now and the transaction
                        0.0001))
                    : BigInt(0))
            : inputAmount,
        exactIn: exactIn,
        exactOut: exactOut,
    };
}
