"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LivePositionUpdates = void 0;
exports.nextAutomationPeriodTimestamp = nextAutomationPeriodTimestamp;
exports.eligibleForNextAutomationPeriod = eligibleForNextAutomationPeriod;
exports.getUpdatedValueFromAutomation = getUpdatedValueFromAutomation;
exports.getAdjustedSettingsFromAutomation = getAdjustedSettingsFromAutomation;
exports.getSolautoFeesBps = getSolautoFeesBps;
exports.eligibleForRebalance = eligibleForRebalance;
exports.eligibleForRefresh = eligibleForRefresh;
exports.getSolautoManagedPositions = getSolautoManagedPositions;
exports.getAllReferralStates = getAllReferralStates;
exports.getReferralsByUser = getReferralsByUser;
exports.getAllPositionsByAuthority = getAllPositionsByAuthority;
exports.positionStateWithPrices = positionStateWithPrices;
exports.createFakePositionState = createFakePositionState;
const web3_js_1 = require("@solana/web3.js");
const umi_1 = require("@metaplex-foundation/umi");
const generated_1 = require("../../generated");
const generalUtils_1 = require("../generalUtils");
const numberUtils_1 = require("../numberUtils");
const accountUtils_1 = require("../accountUtils");
const umi_web3js_adapters_1 = require("@metaplex-foundation/umi-web3js-adapters");
const constants_1 = require("../../constants");
const marginfiUtils_1 = require("../marginfiUtils");
function newPeriodsPassed(automation, currentUnixTimestamp) {
    return Math.min(automation.targetPeriods, automation.periodsPassed +
        Math.floor((currentUnixTimestamp - Number(automation.unixStartDate)) /
            Number(automation.intervalSeconds)));
}
function nextAutomationPeriodTimestamp(automation) {
    return automation.periodsPassed === 0
        ? Number(automation.unixStartDate)
        : Number(automation.unixStartDate) +
            automation.periodsPassed * Number(automation.intervalSeconds);
}
function eligibleForNextAutomationPeriod(automation, currentUnixTime) {
    return currentUnixTime >= nextAutomationPeriodTimestamp(automation);
}
function getUpdatedValueFromAutomation(currValue, targetValue, automation, currentUnixTimestamp) {
    const currRateDiff = currValue - targetValue;
    const progressPct = 1 /
        Math.max(1, automation.targetPeriods -
            newPeriodsPassed(automation, currentUnixTimestamp));
    const newValue = currValue - currRateDiff * progressPct;
    return newValue;
}
function getAdjustedSettingsFromAutomation(settings, currentUnixTime) {
    const boostToBps = settings.automation.targetPeriods > 0 &&
        eligibleForNextAutomationPeriod(settings.automation, currentUnixTime)
        ? getUpdatedValueFromAutomation(settings.boostToBps, settings.targetBoostToBps, settings.automation, currentUnixTime)
        : settings.boostToBps;
    return {
        ...settings,
        boostToBps,
    };
}
function getSolautoFeesBps(isReferred, feeType) {
    const fees = feeType === generated_1.FeeType.Small ? 100 : 500;
    let referrer = 0;
    if (isReferred) {
        referrer = fees / 4;
    }
    return {
        solauto: fees - referrer,
        referrer,
        total: fees,
    };
}
function eligibleForRebalance(positionState, positionSettings, positionDca, currentUnixSecs) {
    if (positionDca.automation.targetPeriods > 0 &&
        eligibleForNextAutomationPeriod(positionDca.automation, currentUnixSecs)) {
        return "dca";
    }
    if (positionState.supply.amountUsed.baseUnit === BigInt(0)) {
        return undefined;
    }
    const boostToBps = eligibleForRefresh(positionState, positionSettings, currentUnixSecs) &&
        positionSettings.automation.targetPeriods > 0
        ? getUpdatedValueFromAutomation(positionSettings.boostToBps, positionSettings.targetBoostToBps, positionSettings.automation, currentUnixSecs)
        : positionSettings.boostToBps;
    const repayFrom = positionSettings.repayToBps + positionSettings.repayGap;
    const boostFrom = boostToBps - positionSettings.boostGap;
    if (positionState.liqUtilizationRateBps <= boostFrom) {
        return "boost";
    }
    else if (positionState.liqUtilizationRateBps >= repayFrom) {
        return "repay";
    }
    return undefined;
}
function eligibleForRefresh(positionState, positionSettings, currentUnixTime) {
    if (positionSettings.automation.targetPeriods > 0) {
        return eligibleForNextAutomationPeriod(positionSettings.automation, currentUnixTime);
    }
    else {
        return ((0, generalUtils_1.currentUnixSeconds)() - Number(positionState.lastUpdated) >
            60 * 60 * 24 * 7);
    }
}
async function getSolautoManagedPositions(umi, authority) {
    // bump: [u8; 1]
    // position_id: [u8; 1]
    // self_managed: u8 - (1 for true, 0 for false)
    // padding: [u8; 5]
    // authority: Pubkey
    // lending_platform: u8
    const accounts = await umi.rpc.getProgramAccounts(generated_1.SOLAUTO_PROGRAM_ID, {
        commitment: "finalized",
        dataSlice: {
            offset: 0,
            length: 1 + 1 + 1 + 5 + 32 + 1, // bump + position_id + self_managed + padding + authority (pubkey) + lending_platform
        },
        filters: [
            {
                dataSize: (0, generated_1.getSolautoPositionSize)(),
            },
            {
                memcmp: {
                    bytes: new Uint8Array([0]),
                    offset: 2,
                },
            },
            ...(authority
                ? [
                    {
                        memcmp: {
                            bytes: new Uint8Array(authority.toBuffer()),
                            offset: 8,
                        },
                    },
                ]
                : []),
        ],
    });
    return accounts.map((x) => {
        const [position, _] = (0, generated_1.getSolautoPositionAccountDataSerializer)().deserialize(new Uint8Array([
            ...x.data,
            ...Array((0, generated_1.getSolautoPositionSize)() - x.data.length).fill(0),
        ]));
        return {
            publicKey: (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(x.publicKey),
            authority: (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(position.authority),
            positionId: position.positionId[0],
            lendingPlatform: position.position.lendingPlatform,
        };
    });
}
async function getAllReferralStates(umi) {
    const accounts = await umi.rpc.getProgramAccounts(generated_1.SOLAUTO_PROGRAM_ID, {
        commitment: "finalized",
        dataSlice: {
            offset: 0,
            length: 0,
        },
        filters: [
            {
                dataSize: (0, generated_1.getReferralStateSize)(),
            },
        ],
    });
    return accounts.map((x) => (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(x.publicKey));
}
async function getReferralsByUser(umi, user) {
    // bump: [u8; 1],
    // padding: [u8; 7],
    // authority: Pubkey,
    // referred_by_state: Pubkey,
    const userReferralState = await (0, accountUtils_1.getReferralState)(user);
    const accounts = await umi.rpc.getProgramAccounts(generated_1.SOLAUTO_PROGRAM_ID, {
        commitment: "finalized",
        dataSlice: {
            offset: 0,
            length: 0,
        },
        filters: [
            {
                dataSize: (0, generated_1.getReferralStateSize)(),
            },
            {
                memcmp: {
                    bytes: userReferralState.toBytes(),
                    offset: 1 + 7 + 32, // bump + padding + authority - target the referred_by_state field
                },
            },
        ],
    });
    return accounts.map((x) => (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(x.publicKey));
}
async function getAllPositionsByAuthority(umi, user) {
    const allPositions = [];
    const solautoManagedPositions = await getSolautoManagedPositions(umi, user);
    allPositions.push(...solautoManagedPositions.map((x) => ({
        publicKey: x.publicKey,
        authority: user,
        positionId: x.positionId,
        lendingPlatform: x.lendingPlatform,
    })));
    let marginfiPositions = await (0, marginfiUtils_1.getAllMarginfiAccountsByAuthority)(umi, user, true);
    marginfiPositions = marginfiPositions.filter((x) => x.supplyMint &&
        (x.debtMint.equals(web3_js_1.PublicKey.default) ||
            constants_1.ALL_SUPPORTED_TOKENS.includes(x.debtMint.toString())));
    allPositions.push(...marginfiPositions.map((x) => ({
        publicKey: x.marginfiAccount,
        authority: user,
        positionId: 0,
        lendingPlatform: generated_1.LendingPlatform.Marginfi,
        protocolAccount: x.marginfiAccount,
        supplyMint: x.supplyMint,
        debtMint: x.debtMint,
    })));
    // TODO support other platforms
    return allPositions;
}
async function positionStateWithPrices({ state, supplyPrice, debtPrice, umi, protocolAccount, lendingPlatform, }) {
    if ((0, generalUtils_1.currentUnixSeconds)() - Number(state.lastUpdated) > 60 * 60 * 24 * 7) {
        if (umi === undefined ||
            protocolAccount === undefined ||
            lendingPlatform === undefined) {
            throw new Error("Missing required parameters");
        }
        if (lendingPlatform === generated_1.LendingPlatform.Marginfi) {
            return await (0, marginfiUtils_1.getMarginfiAccountPositionState)(umi, protocolAccount, (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(state.supply.mint), (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(state.debt.mint));
        }
        else {
            throw new Error("Lending platorm not yet supported");
        }
    }
    if (!supplyPrice || !debtPrice) {
        [supplyPrice, debtPrice] = await (0, generalUtils_1.getTokenPrices)([
            (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(state.supply.mint),
            (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(state.debt.mint),
        ]);
    }
    const supplyUsd = (0, numberUtils_1.fromBaseUnit)(state.supply.amountUsed.baseUnit, state.supply.decimals) *
        supplyPrice;
    const debtUsd = (0, numberUtils_1.fromBaseUnit)(state.debt.amountUsed.baseUnit, state.debt.decimals) *
        debtPrice;
    return {
        ...state,
        liqUtilizationRateBps: (0, numberUtils_1.getLiqUtilzationRateBps)(supplyUsd, debtUsd, state.liqThresholdBps),
        netWorth: {
            baseUnit: (0, numberUtils_1.toBaseUnit)((supplyUsd - debtUsd) / supplyPrice, state.supply.decimals),
            baseAmountUsdValue: (0, numberUtils_1.toBaseUnit)(supplyUsd - debtUsd, constants_1.USD_DECIMALS),
        },
        supply: {
            ...state.supply,
            amountUsed: {
                ...state.supply.amountUsed,
                baseAmountUsdValue: (0, numberUtils_1.toBaseUnit)(supplyUsd, constants_1.USD_DECIMALS),
            },
        },
        debt: {
            ...state.debt,
            amountUsed: {
                ...state.debt.amountUsed,
                baseAmountUsdValue: (0, numberUtils_1.toBaseUnit)(debtUsd, constants_1.USD_DECIMALS),
            },
        },
    };
}
function createFakePositionState(supply, debt, maxLtvBps, liqThresholdBps) {
    const supplyUsd = (0, numberUtils_1.fromBaseUnit)(supply.amountUsedBaseUnit, supply.decimals) * supply.price;
    const debtUsd = (0, numberUtils_1.fromBaseUnit)(debt.amountUsedBaseUnit, debt.decimals) * debt.price;
    return {
        liqUtilizationRateBps: (0, numberUtils_1.getLiqUtilzationRateBps)(supplyUsd, debtUsd, liqThresholdBps),
        supply: {
            amountUsed: {
                baseUnit: supply.amountUsedBaseUnit,
                baseAmountUsdValue: (0, numberUtils_1.toBaseUnit)(supplyUsd, constants_1.USD_DECIMALS),
            },
            amountCanBeUsed: {
                baseUnit: (0, numberUtils_1.toBaseUnit)(1000000, supply.decimals),
                baseAmountUsdValue: BigInt(Math.round(1000000 * supply.price)),
            },
            baseAmountMarketPriceUsd: (0, numberUtils_1.toBaseUnit)(supply.price, constants_1.USD_DECIMALS),
            borrowFeeBps: 0,
            decimals: supply.decimals,
            flashLoanFeeBps: 0,
            mint: (0, umi_1.publicKey)(supply.mint),
            padding1: [],
            padding2: [],
            padding: new Uint8Array([]),
        },
        debt: {
            amountUsed: {
                baseUnit: debt.amountUsedBaseUnit,
                baseAmountUsdValue: (0, numberUtils_1.toBaseUnit)(debtUsd, constants_1.USD_DECIMALS),
            },
            amountCanBeUsed: {
                baseUnit: (0, numberUtils_1.toBaseUnit)(1000000, debt.decimals),
                baseAmountUsdValue: BigInt(Math.round(1000000 * debt.price)),
            },
            baseAmountMarketPriceUsd: (0, numberUtils_1.toBaseUnit)(debt.price, constants_1.USD_DECIMALS),
            borrowFeeBps: 0,
            decimals: debt.decimals,
            flashLoanFeeBps: 0,
            mint: (0, umi_1.publicKey)(debt.mint),
            padding1: [],
            padding2: [],
            padding: new Uint8Array([]),
        },
        netWorth: {
            baseUnit: (0, numberUtils_1.toBaseUnit)((supplyUsd - debtUsd) / supply.price, supply.decimals),
            baseAmountUsdValue: (0, numberUtils_1.toBaseUnit)(supplyUsd - debtUsd, constants_1.USD_DECIMALS),
        },
        maxLtvBps,
        liqThresholdBps,
        lastUpdated: BigInt((0, generalUtils_1.currentUnixSeconds)()),
        padding1: [],
        padding2: [],
        padding: [],
    };
}
class LivePositionUpdates {
    constructor() {
        this.supplyAdjustment = BigInt(0);
        this.debtAdjustment = BigInt(0);
        this.debtTaBalanceAdjustment = BigInt(0);
        this.settings = undefined;
        this.activeDca = undefined;
    }
    new(update) {
        if (update.type === "supply") {
            this.supplyAdjustment += update.value;
        }
        else if (update.type === "debt") {
            this.debtAdjustment += update.value;
        }
        else if (update.type === "debtDcaIn") {
            this.debtTaBalanceAdjustment += update.value;
        }
        else if (update.type === "settings") {
            const settings = update.value;
            this.settings = {
                automation: (0, umi_1.isOption)(settings.automation) && (0, umi_1.isSome)(settings.automation)
                    ? {
                        ...settings.automation.value,
                        intervalSeconds: BigInt(settings.automation.value.intervalSeconds),
                        unixStartDate: BigInt(settings.automation.value.unixStartDate),
                        padding: new Uint8Array([]),
                        padding1: [],
                    }
                    : {
                        targetPeriods: 0,
                        periodsPassed: 0,
                        intervalSeconds: BigInt(0),
                        unixStartDate: BigInt(0),
                        padding: new Uint8Array([]),
                        padding1: [],
                    },
                targetBoostToBps: (0, umi_1.isOption)(settings.targetBoostToBps) &&
                    (0, umi_1.isSome)(settings.targetBoostToBps)
                    ? settings.targetBoostToBps.value
                    : 0,
                boostGap: settings.boostGap,
                boostToBps: settings.boostToBps,
                repayGap: settings.repayGap,
                repayToBps: settings.repayToBps,
                padding: new Uint8Array([]),
                padding1: [],
            };
        }
        else if (update.type === "dca") {
            const dca = update.value;
            this.activeDca = {
                automation: {
                    ...dca.automation,
                    intervalSeconds: BigInt(dca.automation.intervalSeconds),
                    unixStartDate: BigInt(dca.automation.unixStartDate),
                    padding: new Uint8Array([]),
                    padding1: [],
                },
                debtToAddBaseUnit: BigInt(dca.debtToAddBaseUnit),
                padding: new Uint8Array([]),
            };
        }
    }
    reset() {
        this.supplyAdjustment = BigInt(0);
        this.debtAdjustment = BigInt(0);
        this.debtTaBalanceAdjustment = BigInt(0);
        this.settings = undefined;
        this.activeDca = undefined;
    }
    hasUpdates() {
        return (this.supplyAdjustment !== BigInt(0) ||
            this.debtAdjustment !== BigInt(0) ||
            this.debtTaBalanceAdjustment !== BigInt(0) ||
            this.settings !== undefined);
    }
}
exports.LivePositionUpdates = LivePositionUpdates;