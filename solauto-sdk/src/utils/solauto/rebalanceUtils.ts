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
  calcDebtUsd,
  calcNetWorthUsd,
  calcSupplyUsd,
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
import { safeGetPrice } from "../priceUtils";
import { BROKEN_TOKENS, JUP, USDC, USDT } from "../../constants";
import { Umi } from "@metaplex-foundation/umi";

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

  if (state.liqUtilizationRateBps < adjustedSettings.boostToBps) {
    return adjustedSettings.boostToBps;
  } else if (state.liqUtilizationRateBps > settings.repayToBps) {
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

  // TODO: REVERT ME AND GET TO THE ROOT OF THIS ISSUE
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
    calcNetWorthUsd(state),
    rebalanceDirection
  ).total;

  let debtAdjustmentUsd = getDebtAdjustmentUsd(
    state.liqThresholdBps,
    calcSupplyUsd(state) + amountUsdToDcaIn,
    calcDebtUsd(state),
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

function postRebalanceLiqUtilizationRateBps(
  client: SolautoClient,
  values: RebalanceValues,
  swapOutputAmount?: bigint
) {
  let supplyUsd =
    calcSupplyUsd(client.solautoPositionState) + values.amountUsdToDcaIn;
  let debtUsd = calcDebtUsd(client.solautoPositionState);

  const boost = values.rebalanceDirection === RebalanceDirection.Boost;

  const outputToken = toWeb3JsPublicKey(
    boost
      ? client.solautoPositionState!.supply.mint
      : client.solautoPositionState!.debt.mint
  );
  const debtAdjustmentUsdAbs = Math.abs(values.debtAdjustmentUsd);
  const swapOutputUsd = swapOutputAmount
    ? fromBaseUnit(swapOutputAmount, tokenInfo(outputToken).decimals) *
      (safeGetPrice(outputToken) ?? 0)
    : debtAdjustmentUsdAbs;

  supplyUsd = boost
    ? supplyUsd + swapOutputUsd
    : supplyUsd - debtAdjustmentUsdAbs;
  debtUsd = boost ? debtUsd + debtAdjustmentUsdAbs : debtUsd - swapOutputUsd;

  return getLiqUtilzationRateBps(
    supplyUsd,
    debtUsd,
    client.solautoPositionState?.liqThresholdBps ?? 0
  );
}

function insufficientLiquidity(
  amountNeededUsd: number,
  liquidity: bigint,
  tokenDecimals: number,
  tokenPrice: number
) {
  return amountNeededUsd > fromBaseUnit(liquidity, tokenDecimals) * tokenPrice;
}

export interface FlashLoanRequirements {
  useDebtLiquidity: boolean;
  signerFlashLoan: boolean;
}

export async function getFlashLoanRequirements(
  client: SolautoClient,
  values: RebalanceValues,
  attemptNum?: number
): Promise<FlashLoanRequirements | undefined> {
  let supplyUsd =
    calcSupplyUsd(client.solautoPositionState) +
    (values.dcaTokenType === TokenType.Supply ? values.amountUsdToDcaIn : 0);
  let debtUsd = calcDebtUsd(client.solautoPositionState);

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

  const supplyPrice = safeGetPrice(client.supplyMint) ?? 0;
  const debtPrice = safeGetPrice(client.debtMint) ?? 0;
  const debtAdjustmentUsd = Math.abs(values.debtAdjustmentUsd);

  const insufficientSupplyLiquidity = insufficientLiquidity(
    debtAdjustmentUsd,
    client.supplyLiquidityAvailable(),
    tokenInfo(client.supplyMint).decimals,
    supplyPrice
  );
  const insufficientDebtLiquidity = insufficientLiquidity(
    debtAdjustmentUsd,
    client.debtLiquidityAvailable(),
    tokenInfo(client.debtMint).decimals,
    debtPrice
  );

  let useDebtLiquidity =
    values.rebalanceDirection === RebalanceDirection.Boost ||
    insufficientSupplyLiquidity;

  let signerFlashLoan = false;
  if (
    (attemptNum ?? 0) >= 3 ||
    (insufficientSupplyLiquidity && insufficientDebtLiquidity)
  ) {
    const { supplyBalance, debtBalance } = await client.signerBalances();
    const sufficientSignerSupplyLiquidity = !insufficientLiquidity(
      debtAdjustmentUsd,
      supplyBalance,
      tokenInfo(client.supplyMint).decimals,
      supplyPrice
    );
    const sufficientSignerDebtLiquidity = !insufficientLiquidity(
      debtAdjustmentUsd,
      debtBalance,
      tokenInfo(client.debtMint).decimals,
      debtPrice
    );

    signerFlashLoan =
      sufficientSignerSupplyLiquidity || sufficientSignerDebtLiquidity;
    if (signerFlashLoan) {
      useDebtLiquidity =
        values.rebalanceDirection === RebalanceDirection.Boost ||
        !sufficientSignerSupplyLiquidity;
    } else {
      throw new Error(
        `Need at least ${values.debtAdjustmentUsd / debtPrice} ${tokenInfo(client.debtMint).ticker} or ${values.debtAdjustmentUsd / supplyPrice} ${tokenInfo(client.supplyMint).ticker} to perform the transaction`
      );
    }
  }

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

async function findSufficientQuote(
  client: SolautoClient,
  values: RebalanceValues,
  jupSwapInput: JupSwapInput,
  criteria: {
    minOutputAmount?: bigint;
    minLiqUtilizationRateBps?: number;
    maxLiqUtilizationRateBps?: number;
  }
): Promise<QuoteResponse> {
  let jupQuote: QuoteResponse;
  let insufficient: boolean = false;

  for (let i = 0; i < 10; i++) {
    consoleLog("Finding sufficient quote...");
    jupQuote = await getJupQuote(jupSwapInput);

    const outputAmount = parseInt(jupQuote.outAmount);
    const postRebalanceRate = postRebalanceLiqUtilizationRateBps(
      client,
      values,
      BigInt(outputAmount)
    );
    insufficient = criteria.minOutputAmount
      ? outputAmount < Number(criteria.minOutputAmount)
      : criteria.minLiqUtilizationRateBps
        ? postRebalanceRate < criteria.minLiqUtilizationRateBps
        : postRebalanceRate > criteria.maxLiqUtilizationRateBps!;

    if (insufficient) {
      consoleLog(jupQuote);
      jupSwapInput.amount =
        jupSwapInput.amount +
        BigInt(Math.round(Number(jupSwapInput.amount) * 0.01));
    } else {
      break;
    }
  }

  return jupQuote!;
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
  let outputAmount = rebalanceToZero
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

  const exactOut = flashLoanRepayFromDebt && !rebalanceToZero;
  // || rebalanceToZero
  const exactIn = !exactOut;

  if (exactIn && (rebalanceToZero || values.repayingCloseToMaxLtv)) {
    inputAmount = inputAmount + BigInt(Math.round(Number(inputAmount) * 0.005));
  }

  const jupSwapInput: JupSwapInput = {
    inputMint: toWeb3JsPublicKey(input.mint),
    outputMint: toWeb3JsPublicKey(output.mint),
    exactIn,
    exactOut,
    amount: exactOut ? outputAmount : inputAmount,
  };
  consoleLog(jupSwapInput);

  let jupQuote: QuoteResponse | undefined = undefined;
  if (exactIn && (rebalanceToZero || values.repayingCloseToMaxLtv)) {
    jupQuote = await findSufficientQuote(client, values, jupSwapInput, {
      minOutputAmount: rebalanceToZero ? outputAmount : undefined,
      maxLiqUtilizationRateBps: values.repayingCloseToMaxLtv
        ? maxRepayToBps(
            client.solautoPositionState?.maxLtvBps ?? 0,
            client.solautoPositionState?.liqThresholdBps ?? 0
          ) - 15
        : undefined,
    });
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
