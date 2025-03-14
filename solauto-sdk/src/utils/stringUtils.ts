import { NATIVE_MINT } from "@solana/spl-token";
import { WBTC, WETH } from "../constants";
import { PublicKey } from "@solana/web3.js";
import { tokenInfo } from "./generalUtils";

export const StrategyTypes = ["Long", "Short", "Ratio"] as const;
export type StrategyType = (typeof StrategyTypes)[number];

const MAJORS_PRIO = {
  [WBTC.toString()]: 0,
  [WETH.toString()]: 1,
  [NATIVE_MINT.toString()]: 2,
};

function adjustedTicker(mint?: PublicKey) {
  const info = tokenInfo(mint);

  if (info.ticker.toLowerCase() === "wbtc") {
    return "BTC";
  } else if (info.ticker.toLowerCase() === "weth") {
    return "ETH";
  } else {
    return info.ticker;
  }
}

export function ratioName(supplyMint?: PublicKey, debtMint?: PublicKey) {
  if (
    (tokenInfo(supplyMint).isLST && debtMint?.equals(NATIVE_MINT)) ||
    (supplyMint &&
      debtMint &&
      MAJORS_PRIO[supplyMint!.toString()] > MAJORS_PRIO[debtMint!.toString()])
  ) {
    return `${adjustedTicker(supplyMint)}/${adjustedTicker(debtMint)} Long`;
  } else {
    return `${adjustedTicker(debtMint)}/${adjustedTicker(supplyMint)} Short`;
  }
}

export function solautoStrategyName(
  supplyMint?: PublicKey,
  debtMint?: PublicKey
) {
  const strat = strategyType(
    supplyMint ?? PublicKey.default,
    debtMint ?? PublicKey.default
  );

  if (strat === "Long") {
    return `${adjustedTicker(supplyMint)} Long`;
  } else if (strat === "Ratio") {
    return ratioName(supplyMint, debtMint);
  } else {
    return `${adjustedTicker(debtMint)} Short`;
  }
}

export function strategyType(
  supplyMint: PublicKey,
  debtMint: PublicKey
): StrategyType {
  const supplyInfo = tokenInfo(supplyMint);
  const debtInfo = tokenInfo(debtMint);

  if (!supplyInfo.isStableCoin && !debtInfo.isStableCoin) {
    return "Ratio";
  } else if (debtInfo.isStableCoin) {
    return "Long";
  } else {
    return "Short";
  }
}
