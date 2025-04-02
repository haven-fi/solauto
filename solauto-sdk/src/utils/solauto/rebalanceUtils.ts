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
