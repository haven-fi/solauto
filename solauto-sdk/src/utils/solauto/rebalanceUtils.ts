import { PublicKey } from "@solana/web3.js";
import { SolautoClient } from "../../services/solauto/solautoClient";
import {
  DCASettings,
  PositionState,
  PositionTokenState,
  RebalanceDirection,
  SolautoSettingsParameters,
  TokenType,
} from "../../generated";
import {
  eligibleForNextAutomationPeriod,
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
      throw new Error(`Insufficient liquidity to perform the transaction`);
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
  let flashLoanToken: PositionTokenState | undefined = undefined;

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

export async function findSufficientQuote(
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
