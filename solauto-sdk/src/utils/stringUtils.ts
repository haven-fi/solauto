import { PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { MAJORS_PRIO } from "../constants";
import { tokenInfo } from "./generalUtils";

export const StrategyTypes = ["Long", "Short", "Ratio"] as const;
export type StrategyType = (typeof StrategyTypes)[number];

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

export function ratioMintDetails(supplyMint?: PublicKey, debtMint?: PublicKey) {
  if (
    (tokenInfo(supplyMint).isLST && debtMint?.equals(NATIVE_MINT)) ||
    (supplyMint &&
      debtMint &&
      MAJORS_PRIO[supplyMint?.toString() ?? ""] >
        MAJORS_PRIO[debtMint?.toString() ?? ""])
  ) {
    return { order: [supplyMint, debtMint], strategyName: "Long" };
  } else {
    return { order: [debtMint, supplyMint], strategyName: "Short" };
  }
}

export function ratioName(supplyMint?: PublicKey, debtMint?: PublicKey) {
  const { order, strategyName } = ratioMintDetails(supplyMint, debtMint);
  return `${adjustedTicker(order[0])}/${adjustedTicker(order[1])} ${strategyName}`;
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
