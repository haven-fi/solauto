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
function getAdditionalAmountToDcaIn(client) {
    const dca = client.solautoPositionActiveDca();
    if (dca.debtToAddBaseUnit === BigInt(0)) {
        return 0;
    }
    const debtBalance = Number(client.solautoPositionData?.position.dca.debtToAddBaseUnit ?? 0) +
        Number(client.livePositionUpdates.debtTaBalanceAdjustment ?? 0);
    const updatedDebtBalance = (0, generalUtils_1.getUpdatedValueFromAutomation)(debtBalance, 0, dca.automation, (0, generalUtils_2.currentUnixSeconds)());
    return debtBalance - updatedDebtBalance;
}
function getStandardTargetLiqUtilizationRateBps(client) {
    if (!client.selfManaged) {
        const adjustedSettings = (0, generalUtils_1.getAdjustedSettingsFromAutomation)(client.solautoPositionSettings(), (0, generalUtils_2.currentUnixSeconds)());
        const repayFrom = adjustedSettings.repayToBps - adjustedSettings.repayGap;
        const boostFrom = adjustedSettings.boostToBps + adjustedSettings.boostGap;
        if (client.solautoPositionState.liqUtilizationRateBps < boostFrom) {
            return adjustedSettings.boostToBps;
        }
        else if (client.solautoPositionState.liqUtilizationRateBps > repayFrom ||
            repayFrom - client.solautoPositionState.liqUtilizationRateBps <
                repayFrom * 0.015) {
            return adjustedSettings.repayToBps;
        }
        else {
            throw new Error("Invalid rebalance condition");
        }
    }
    else {
        throw new Error("This is a self-managed position, a targetLiqUtilizationRateBps must be provided initiate a rebalance");
    }
}
function targetLiqUtilizationRateBpsFromDCA(client) {
    const adjustedSettings = (0, generalUtils_1.getAdjustedSettingsFromAutomation)(client.solautoPositionSettings(), (0, generalUtils_2.currentUnixSeconds)());
    let targetRateBps = 0;
    if (client.solautoPositionActiveDca().debtToAddBaseUnit > BigInt(0)) {
        targetRateBps = Math.max(client.solautoPositionState.liqUtilizationRateBps, adjustedSettings.boostToBps);
    }
    else {
        targetRateBps = adjustedSettings.boostToBps;
    }
    return targetRateBps;
}
function isDcaRebalance(client) {
    if (client.solautoPositionActiveDca() === undefined || client.selfManaged) {
        return false;
    }
    const adjustedSettings = (0, generalUtils_1.getAdjustedSettingsFromAutomation)(client.solautoPositionSettings(), (0, generalUtils_2.currentUnixSeconds)());
    if (client.solautoPositionState.liqUtilizationRateBps >
        adjustedSettings.repayToBps + adjustedSettings.repayGap) {
        return false;
    }
    if (client.solautoPositionActiveDca().automation.targetPeriods === 0) {
        return false;
    }
    if (!(0, generalUtils_1.eligibleForNextAutomationPeriod)(client.solautoPositionActiveDca().automation)) {
        return false;
    }
    return true;
}
function getTargetRateAndDcaAmount(client, targetLiqUtilizationRateBps) {
    if (targetLiqUtilizationRateBps !== undefined) {
        return {
            targetRateBps: targetLiqUtilizationRateBps,
        };
    }
    if (isDcaRebalance(client)) {
        const amountToDcaIn = getAdditionalAmountToDcaIn(client);
        const targetLiqUtilizationRateBps = targetLiqUtilizationRateBpsFromDCA(client);
        return {
            targetRateBps: targetLiqUtilizationRateBps,
            amountToDcaIn,
        };
    }
    else {
        return {
            targetRateBps: getStandardTargetLiqUtilizationRateBps(client),
        };
    }
}
function getRebalanceValues(client, targetLiqUtilizationRateBps, limitGapBps) {
    if (client.solautoPositionState === undefined ||
        client.solautoPositionState.lastUpdated <
            BigInt(Math.round((0, generalUtils_2.currentUnixSeconds)() - solautoConstants_1.MIN_POSITION_STATE_FRESHNESS_SECS))) {
        throw new Error("Requires a fresh position state to get rebalance details");
    }
    const { targetRateBps, amountToDcaIn } = getTargetRateAndDcaAmount(client, targetLiqUtilizationRateBps);
    const amountUsdToDcaIn = (0, numberUtils_1.fromBaseUnit)(BigInt(Math.round(amountToDcaIn ?? 0)), client.solautoPositionState.debt.decimals) * solautoConstants_1.PRICES[client.debtMint.toString()].price;
    const increasingLeverage = amountUsdToDcaIn > 0 ||
        client.solautoPositionState.liqUtilizationRateBps < targetRateBps;
    let adjustmentFeeBps = 0;
    if (increasingLeverage) {
        adjustmentFeeBps = (0, generalUtils_1.getSolautoFeesBps)(client.referredByState !== undefined, client.solautoPositionData?.feeType ?? generated_1.FeeType.Small).total;
    }
    const supplyUsd = (0, numberUtils_1.fromBaseUnit)(client.solautoPositionState.supply.amountUsed.baseAmountUsdValue, generalAccounts_1.USD_DECIMALS) + amountUsdToDcaIn;
    const debtUsd = (0, numberUtils_1.fromBaseUnit)(client.solautoPositionState.debt.amountUsed.baseAmountUsdValue, generalAccounts_1.USD_DECIMALS);
    let debtAdjustmentUsd = (0, numberUtils_1.getDebtAdjustmentUsd)(client.solautoPositionState.liqThresholdBps, supplyUsd, debtUsd, targetRateBps, adjustmentFeeBps);
    const input = increasingLeverage
        ? client.solautoPositionState.debt
        : client.solautoPositionState.supply;
    const inputMarketPrice = increasingLeverage
        ? solautoConstants_1.PRICES[client.debtMint.toString()].price
        : solautoConstants_1.PRICES[client.supplyMint.toString()].price;
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
    return {
        increasingLeverage,
        debtAdjustmentUsd,
        amountUsdToDcaIn,
    };
}
function getFlashLoanDetails(client, values, jupQuote) {
    let supplyUsd = (0, numberUtils_1.fromBaseUnit)(client.solautoPositionState.supply.amountUsed.baseAmountUsdValue, generalAccounts_1.USD_DECIMALS);
    let debtUsd = (0, numberUtils_1.fromBaseUnit)(client.solautoPositionState.debt.amountUsed.baseAmountUsdValue, generalAccounts_1.USD_DECIMALS);
    const debtAdjustmentWithSlippage = Math.abs(values.debtAdjustmentUsd) +
        Math.abs(values.debtAdjustmentUsd) * (0, numberUtils_1.fromBps)(jupQuote.slippageBps);
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
            (0, numberUtils_1.getMaxLiqUtilizationRate)(client.solautoPositionState.maxLtvBps, client.solautoPositionState.liqThresholdBps);
    let flashLoanToken = undefined;
    let flashLoanTokenPrice = 0;
    if (values.increasingLeverage) {
        flashLoanToken = client.solautoPositionState.debt;
        flashLoanTokenPrice = solautoConstants_1.PRICES[client.debtMint.toString()].price;
    }
    else {
        flashLoanToken = client.solautoPositionState.supply;
        flashLoanTokenPrice = solautoConstants_1.PRICES[client.supplyMint.toString()].price;
    }
    const exactAmountBaseUnit = jupQuote && jupQuote.swapMode === "ExactOut"
        ? BigInt(parseInt(jupQuote.inAmount))
        : undefined;
    return requiresFlashLoan
        ? {
            baseUnitAmount: exactAmountBaseUnit
                ? exactAmountBaseUnit +
                    BigInt(Math.round(Number(exactAmountBaseUnit) * (0, numberUtils_1.fromBps)(jupQuote.slippageBps)))
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
    const usdToSwap = Math.abs(values.debtAdjustmentUsd) + values.amountUsdToDcaIn;
    const inputPrice = values.increasingLeverage
        ? solautoConstants_1.PRICES[client.debtMint.toString()].price
        : solautoConstants_1.PRICES[client.supplyMint.toString()].price;
    const inputAmount = (0, numberUtils_1.toBaseUnit)(usdToSwap / inputPrice, input.decimals);
    const rebalancingToZero = targetLiqUtilizationRateBps === 0;
    return {
        inputMint: (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(input.mint),
        outputMint: (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(output.mint),
        destinationWallet: client.solautoPosition,
        slippageBpsIncFactor: 0.25 + ((attemptNum ?? 0) * 0.2),
        amount: rebalancingToZero
            ? client.solautoPositionState.debt.amountUsed.baseUnit +
                BigInt(Math.round(Number(client.solautoPositionState.debt.amountUsed.baseUnit) *
                    // Add this small percentage to account for the APR on the debt between now and the transaction
                    0.0001))
            : inputAmount,
        exactOut: rebalancingToZero,
    };
}
