import { PublicKey } from "@solana/web3.js";
import { SolautoClient } from "../../clients/solautoClient";
import {
  DCASettings,
  PositionState,
  PositionTokenUsage,
  RebalanceDirection,
  SolautoSettingsParameters,
  TokenType,
} from "../../generated";
import {
  eligibleForNextAutomationPeriod,
  getAdjustedSettingsFromAutomation,
  getUpdatedValueFromAutomation,
} from "./generalUtils";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { QuoteResponse } from "@jup-ag/api";
import { getJupQuote, JupSwapDetails, JupSwapInput } from "../jupiterUtils";
import { consoleLog, currentUnixSeconds, tokenInfo } from "../generalUtils";
import {
  fromBaseUnit,
  fromBps,
  getDebtAdjustmentUsd,
  getLiqUtilzationRateBps,
  getMaxLiqUtilizationRateBps,
  getSolautoFeesBps,
  maxBoostToBps,
  maxRepayToBps,
  toBaseUnit,
} from "../numberUtils";
import { USD_DECIMALS } from "../../constants/generalAccounts";
import { RebalanceAction } from "../../types";
import { getPriceImpact, safeGetPrice } from "../priceUtils";
import { BROKEN_TOKENS, JUP, USDC, USDT } from "../../constants";

function getAdditionalAmountToDcaIn(dca: DCASettings): number {
  if (dca.dcaInBaseUnit === BigInt(0)) {
    return 0;
  }

  const debtBalance = Number(dca.dcaInBaseUnit);
  const updatedDebtBalance = getUpdatedValueFromAutomation(
    debtBalance,
    0,
    dca.automation,
    currentUnixSeconds()
  );

  return debtBalance - updatedDebtBalance;
}

function getStandardTargetLiqUtilizationRateBps(
  state: PositionState,
  settings: SolautoSettingsParameters
): number {
  const adjustedSettings = getAdjustedSettingsFromAutomation(
    settings,
    currentUnixSeconds()
  );

  const repayFrom = settings.repayToBps + settings.repayGap;
  const boostFrom = adjustedSettings.boostToBps - settings.boostGap;

  if (state.liqUtilizationRateBps <= boostFrom) {
    return adjustedSettings.boostToBps;
  } else if (state.liqUtilizationRateBps >= repayFrom) {
    return adjustedSettings.repayToBps;
  } else {
    throw new Error("Invalid rebalance condition");
  }
}

function targetLiqUtilizationRateBpsFromDCA(
  state: PositionState,
  settings: SolautoSettingsParameters,
  dca: DCASettings,
  currentUnixTime: number
) {
  const adjustedSettings = getAdjustedSettingsFromAutomation(
    settings,
    currentUnixTime
  );

  let targetRateBps = 0;
  if (dca.dcaInBaseUnit > BigInt(0)) {
    targetRateBps = Math.max(
      state.liqUtilizationRateBps,
      adjustedSettings.boostToBps
    );
  } else {
    targetRateBps = adjustedSettings.boostToBps;
  }
  return targetRateBps;
}

function isDcaRebalance(
  state: PositionState,
  settings: SolautoSettingsParameters,
  dca: DCASettings | undefined,
  currentUnixTime: number
): boolean {
  if (dca === undefined || dca.automation.targetPeriods === 0) {
    return false;
  }

  const adjustedSettings = getAdjustedSettingsFromAutomation(
    settings,
    currentUnixTime
  );

  if (
    state.liqUtilizationRateBps >
    adjustedSettings.repayToBps + adjustedSettings.repayGap
  ) {
    return false;
  }

  if (!eligibleForNextAutomationPeriod(dca.automation, currentUnixTime)) {
    return false;
  }

  return true;
}

function getTargetRateAndDcaAmount(
  state: PositionState,
  settings: SolautoSettingsParameters | undefined,
  dca: DCASettings | undefined,
  currentUnixTime: number,
  targetLiqUtilizationRateBps?: number
): { targetRateBps: number; amountToDcaIn?: number } {
  if (targetLiqUtilizationRateBps !== undefined) {
    return {
      targetRateBps: targetLiqUtilizationRateBps,
    };
  }

  if (settings === undefined) {
    throw new Error(
      "If rebalancing a self-managed position, settings and DCA should be provided"
    );
  }

  if (isDcaRebalance(state, settings, dca, currentUnixTime)) {
    const targetLiqUtilizationRateBps = targetLiqUtilizationRateBpsFromDCA(
      state,
      settings,
      dca!,
      currentUnixTime
    );
    const amountToDcaIn = getAdditionalAmountToDcaIn(dca!);

    return {
      targetRateBps: targetLiqUtilizationRateBps,
      amountToDcaIn,
    };
  } else {
    return {
      targetRateBps: getStandardTargetLiqUtilizationRateBps(state, settings),
    };
  }
}

export interface RebalanceValues {
  debtAdjustmentUsd: number;
  repayingCloseToMaxLtv: boolean;
  amountToDcaIn: number;
  amountUsdToDcaIn: number;
  dcaTokenType?: TokenType;
  rebalanceAction: RebalanceAction;
  rebalanceDirection: RebalanceDirection;
  feesUsd: number;
  targetRateBps: number;
}

export function getRebalanceValues(
  state: PositionState,
  settings: SolautoSettingsParameters | undefined,
  dca: DCASettings | undefined,
  currentUnixTime: number,
  supplyPrice: number,
  debtPrice: number,
  targetLiqUtilizationRateBps?: number
): RebalanceValues {
  let { targetRateBps, amountToDcaIn } = getTargetRateAndDcaAmount(
    state,
    settings,
    dca,
    currentUnixTime,
    targetLiqUtilizationRateBps
  );

  // REVERT ME AND GET TO THE ROOT OF THIS ISSUE
  const supplyMint = toWeb3JsPublicKey(state.supply.mint);
  if (
    BROKEN_TOKENS.includes(supplyMint.toString()) &&
    (toWeb3JsPublicKey(state.debt.mint).equals(new PublicKey(USDC)) ||
      toWeb3JsPublicKey(state.debt.mint).equals(new PublicKey(USDT))) &&
    settings &&
    settings.boostToBps ===
      maxBoostToBps(state.maxLtvBps, state.liqThresholdBps) &&
    targetRateBps === settings.boostToBps
  ) {
    targetRateBps = 6500;
  }

  const amountUsdToDcaIn =
    fromBaseUnit(BigInt(Math.round(amountToDcaIn ?? 0)), state.debt.decimals) *
    (dca?.tokenType === TokenType.Debt ? debtPrice : supplyPrice);

  const rebalanceDirection =
    amountUsdToDcaIn > 0 || state.liqUtilizationRateBps <= targetRateBps
      ? RebalanceDirection.Boost
      : RebalanceDirection.Repay;
  const adjustmentFeeBps = getSolautoFeesBps(
    false,
    targetLiqUtilizationRateBps,
    fromBaseUnit(state.netWorth.baseAmountUsdValue, USD_DECIMALS),
    rebalanceDirection
  ).total;

  const supplyUsd =
    fromBaseUnit(state.supply.amountUsed.baseAmountUsdValue, USD_DECIMALS) +
    amountUsdToDcaIn;
  const debtUsd = fromBaseUnit(
    state.debt.amountUsed.baseAmountUsdValue,
    USD_DECIMALS
  );
  let debtAdjustmentUsd = getDebtAdjustmentUsd(
    state.liqThresholdBps,
    supplyUsd,
    debtUsd,
    targetRateBps,
    adjustmentFeeBps
  );

  consoleLog(
    "Target rate:",
    targetRateBps,
    maxBoostToBps(state.maxLtvBps, state.liqThresholdBps)
  );
  const maxRepayTo = maxRepayToBps(state.maxLtvBps, state.liqThresholdBps);
  return {
    debtAdjustmentUsd,
    repayingCloseToMaxLtv:
      state.liqUtilizationRateBps > maxRepayTo && targetRateBps >= maxRepayTo,
    amountToDcaIn: amountToDcaIn ?? 0,
    amountUsdToDcaIn,
    dcaTokenType: dca?.tokenType,
    rebalanceAction:
      (amountToDcaIn ?? 0) > 0
        ? "dca"
        : rebalanceDirection === RebalanceDirection.Boost
          ? "boost"
          : "repay",
    rebalanceDirection,
    feesUsd: Math.abs(debtAdjustmentUsd * fromBps(adjustmentFeeBps)),
    targetRateBps,
  };
}

export interface FlashLoanRequirements {
  useDebtLiquidity: boolean;
  signerFlashLoan: boolean;
}

export function getFlashLoanRequirements(
  client: SolautoClient,
  values: RebalanceValues,
  attemptNum?: number
): FlashLoanRequirements | undefined {
  let supplyUsd =
    fromBaseUnit(
      client.solautoPositionState!.supply.amountUsed.baseAmountUsdValue,
      USD_DECIMALS
    ) +
    (values.dcaTokenType === TokenType.Supply ? values.amountUsdToDcaIn : 0);
  let debtUsd = fromBaseUnit(
    client.solautoPositionState!.debt.amountUsed.baseAmountUsdValue,
    USD_DECIMALS
  );

  const debtAdjustmentUsdAbs = Math.abs(values.debtAdjustmentUsd);
  supplyUsd =
    values.rebalanceDirection === RebalanceDirection.Repay
      ? supplyUsd - debtAdjustmentUsdAbs
      : supplyUsd;
  debtUsd =
    values.rebalanceDirection === RebalanceDirection.Boost
      ? debtUsd + debtAdjustmentUsdAbs
      : debtUsd;

  const tempLiqUtilizationRateBps = getLiqUtilzationRateBps(
    supplyUsd,
    debtUsd,
    client.solautoPositionState!.liqThresholdBps
  );
  const maxLiqUtilizationRateBps = getMaxLiqUtilizationRateBps(
    client.solautoPositionState!.maxLtvBps,
    client.solautoPositionState!.liqThresholdBps,
    0.02
  );
  const requiresFlashLoan =
    supplyUsd <= 0 || tempLiqUtilizationRateBps > maxLiqUtilizationRateBps;

  const insufficientSupplyLiquidity =
    Math.abs(values.debtAdjustmentUsd) * 0.9 >
    fromBaseUnit(client.supplyLiquidityAvailable(), USD_DECIMALS) *
      (safeGetPrice(client.supplyMint) ?? 0);
  const insufficientDebtLiquidity =
    Math.abs(values.debtAdjustmentUsd) * 0.9 >
    fromBaseUnit(client.debtLiquidityAvailable(), USD_DECIMALS) *
      (safeGetPrice(client.debtMint) ?? 0);

  let useDebtLiquidity =
    values.rebalanceDirection === RebalanceDirection.Boost ||
    insufficientSupplyLiquidity;

  const isJupLong =
    client.supplyMint.equals(new PublicKey(JUP)) &&
    tokenInfo(client.debtMint).isStableCoin;
  const sufficientSignerSupplyLiquidity = false; // TODO
  const sufficientSignerDebtLiquidity = isJupLong; // TODO
  const signerFlashLoan = Boolean(
    ((attemptNum ?? 0) > 3 ||
      (insufficientSupplyLiquidity && insufficientDebtLiquidity)) &&
      (sufficientSignerSupplyLiquidity || sufficientSignerDebtLiquidity)
  );
  if (signerFlashLoan) {
    useDebtLiquidity = !sufficientSignerSupplyLiquidity;
  }

  // TODO: if not sufficient signer liquidity, throw error with details on how much liquidity is needed and of what token

  consoleLog("Requires flash loan:", requiresFlashLoan);
  consoleLog("Use debt liquidity:", useDebtLiquidity);
  consoleLog(
    "Intermediary liq utilization rate:",
    tempLiqUtilizationRateBps,
    `$${supplyUsd}`,
    `$${debtUsd}`,
    "Max:",
    maxLiqUtilizationRateBps
  );

  return requiresFlashLoan ? { useDebtLiquidity, signerFlashLoan } : undefined;
}

export interface FlashLoanDetails extends FlashLoanRequirements {
  baseUnitAmount: bigint;
  mint: PublicKey;
}

export function getFlashLoanDetails(
  client: SolautoClient,
  flRequirements: FlashLoanRequirements,
  values: RebalanceValues,
  jupQuote: QuoteResponse
): FlashLoanDetails | undefined {
  let flashLoanToken: PositionTokenUsage | undefined = undefined;

  const inAmount = BigInt(parseInt(jupQuote.inAmount));
  const outAmount = BigInt(parseInt(jupQuote.outAmount));

  const boosting = values.rebalanceDirection === RebalanceDirection.Boost;
  if (boosting || flRequirements.useDebtLiquidity) {
    flashLoanToken = client.solautoPositionState!.debt;
  } else {
    flashLoanToken = client.solautoPositionState!.supply;
  }

  if (jupQuote.swapMode !== "ExactOut" && jupQuote.swapMode !== "ExactIn") {
    throw new Error("Token ledger swap not currently supported");
  }

  const baseUnitAmount =
    boosting || (!boosting && !flRequirements.useDebtLiquidity)
      ? inAmount
      : outAmount;

  return {
    ...flRequirements,
    baseUnitAmount,
    mint: toWeb3JsPublicKey(flashLoanToken.mint),
  };
}

export async function getJupSwapRebalanceDetails(
  client: SolautoClient,
  values: RebalanceValues,
  flRequirements?: FlashLoanRequirements,
  targetLiqUtilizationRateBps?: number,
  attemptNum?: number
): Promise<JupSwapDetails> {
  const input =
    values.rebalanceDirection === RebalanceDirection.Boost
      ? client.solautoPositionState!.debt
      : client.solautoPositionState!.supply;
  const output =
    values.rebalanceDirection === RebalanceDirection.Boost
      ? client.solautoPositionState!.supply
      : client.solautoPositionState!.debt;

  const rebalanceToZero = targetLiqUtilizationRateBps === 0;
  const usdToSwap =
    Math.abs(values.debtAdjustmentUsd) +
    (values.dcaTokenType === TokenType.Debt ? values.amountUsdToDcaIn : 0);

  let inputAmount = toBaseUnit(
    usdToSwap / safeGetPrice(input.mint)!,
    input.decimals
  );
  const outputAmount = rebalanceToZero
    ? output.amountUsed.baseUnit +
      BigInt(
        Math.round(
          Number(output.amountUsed.baseUnit) *
            // Add this small percentage to account for the APR on the debt between now and the transaction
            0.0001
        )
      )
    : toBaseUnit(usdToSwap / safeGetPrice(output.mint)!, output.decimals);

  const repaying = values.rebalanceDirection === RebalanceDirection.Repay;

  const flashLoanRepayFromDebt =
    repaying && flRequirements && flRequirements.useDebtLiquidity;

  const exactOut = flashLoanRepayFromDebt;
  // || rebalanceToZero
  const exactIn = !exactOut;

  const jupSwapInput: JupSwapInput = {
    inputMint: toWeb3JsPublicKey(input.mint),
    outputMint: toWeb3JsPublicKey(output.mint),
    exactIn,
    exactOut,
    amount: exactOut ? outputAmount : inputAmount,
  };
  consoleLog(jupSwapInput);

  let jupQuote: QuoteResponse | undefined = undefined;
  if (rebalanceToZero) {
    do {
      jupSwapInput.amount =
        jupSwapInput.amount +
        BigInt(Math.round(Number(jupSwapInput.amount) * 0.01));
      jupQuote = await getJupQuote(jupSwapInput);
    } while (parseInt(jupQuote.outAmount) < outputAmount);
  }

  const addPadding = exactOut;

  return {
    ...jupSwapInput,
    destinationWallet: flashLoanRepayFromDebt
      ? toWeb3JsPublicKey(client.signer.publicKey)
      : client.solautoPosition,
    slippageIncFactor: 0.2 + (attemptNum ?? 0) * 0.25,
    addPadding,
    jupQuote,
  };
}
