import { Umi } from "@metaplex-foundation/umi";
import {
  LendingPlatform,
  PositionState,
  safeFetchSolautoPosition,
  SolautoSettingsParameters,
  SolautoSettingsParametersInpArgs,
} from "../generated";
import { PublicKey } from "@solana/web3.js";
import { SolautoPositionEx } from "./solautoPositionEx";
import { fromWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { MarginfiSolautoPositionEx } from "./marginfiSolautoPositionEx";
import {
  currentUnixSeconds,
  getLiqUtilzationRateBps,
  toBaseUnit,
  toRoundedUsdValue,
} from "../utils";
import { TOKEN_INFO } from "../constants";

export function createSolautoSettings(
  settings: SolautoSettingsParametersInpArgs
): SolautoSettingsParameters {
  return {
    boostGap: settings.boostGap,
    boostToBps: settings.boostToBps,
    repayGap: settings.repayGap,
    repayToBps: settings.repayToBps,
    padding: [],
  };
}

export async function fetchPositionEx(
  umi: Umi,
  publicKey: PublicKey
): Promise<SolautoPositionEx | undefined> {
  const res = await safeFetchSolautoPosition(
    umi,
    fromWeb3JsPublicKey(publicKey)
  );
  if (res) {
    switch (res.position.lendingPlatform) {
      case LendingPlatform.Marginfi:
        return new MarginfiSolautoPositionEx(res, umi);
      default:
        // TODO: PK
        return undefined;
    }
  } else {
    return undefined;
  }
}

interface AssetProps {
  mint: PublicKey;
  price?: number;
  amountUsed?: number;
  amountCanBeUsed?: number;
}

export function createFakePositionState(
  supply: AssetProps,
  debt: AssetProps,
  maxLtvBps: number,
  liqThresholdBps: number
): PositionState {
  const supplyDecimals = TOKEN_INFO[supply.mint.toString()].decimals;
  const debtDecimals = TOKEN_INFO[debt.mint.toString()].decimals;

  const supplyUsd = (supply.amountUsed ?? 0) * (supply.price ?? 0);
  const debtUsd = (debt.amountUsed ?? 0) * (debt.price ?? 0);

  return {
    liqUtilizationRateBps: getLiqUtilzationRateBps(
      supplyUsd,
      debtUsd,
      liqThresholdBps
    ),
    supply: {
      amountUsed: {
        baseUnit: toBaseUnit(supply.amountUsed ?? 0, supplyDecimals),
        baseAmountUsdValue: toRoundedUsdValue(supplyUsd),
      },
      amountCanBeUsed: {
        baseUnit: toBaseUnit(supply.amountCanBeUsed ?? 0, supplyDecimals),
        baseAmountUsdValue: toRoundedUsdValue(
          (supply.amountCanBeUsed ?? 0) * (supply.price ?? 0)
        ),
      },
      baseAmountMarketPriceUsd: toRoundedUsdValue(supply.price ?? 0),
      borrowFeeBps: 0,
      decimals: supplyDecimals,
      mint: fromWeb3JsPublicKey(supply.mint),
      padding1: [],
      padding2: [],
      padding: new Uint8Array([]),
    },
    debt: {
      amountUsed: {
        baseUnit: toBaseUnit(debt.amountUsed ?? 0, debtDecimals),
        baseAmountUsdValue: toRoundedUsdValue(debtUsd),
      },
      amountCanBeUsed: {
        baseUnit: toBaseUnit(debt.amountCanBeUsed ?? 0, debtDecimals),
        baseAmountUsdValue: toRoundedUsdValue(
          (debt.amountCanBeUsed ?? 0) * (debt.price ?? 0)
        ),
      },
      baseAmountMarketPriceUsd: toRoundedUsdValue(debt.price ?? 0),
      borrowFeeBps: 0,
      decimals: debtDecimals,
      mint: fromWeb3JsPublicKey(debt.mint),
      padding1: [],
      padding2: [],
      padding: new Uint8Array([]),
    },
    netWorth: {
      baseUnit: supply.price
        ? toBaseUnit((supplyUsd - debtUsd) / supply.price, supplyDecimals)
        : BigInt(0),
      baseAmountUsdValue: toRoundedUsdValue(supplyUsd - debtUsd),
    },
    maxLtvBps,
    liqThresholdBps,
    lastUpdated: BigInt(currentUnixSeconds()),
    padding1: [],
    padding2: [],
    padding: [],
  };
}
