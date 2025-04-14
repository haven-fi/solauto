import { PublicKey } from "@solana/web3.js";
import { Umi } from "@metaplex-foundation/umi";
import {
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import {
  LendingPlatform,
  PositionState,
  safeFetchAllSolautoPosition,
  safeFetchSolautoPosition,
  SolautoSettingsParameters,
  SolautoSettingsParametersInpArgs,
} from "../generated";
import {
  ContextUpdates,
  currentUnixSeconds,
  getBatches,
  getLiqUtilzationRateBps,
  getSolautoPositionAccount,
  retryWithExponentialBackoff,
  toBaseUnit,
  tokenInfo,
  toRoundedUsdValue,
} from "../utils";
import {
  PositionCustomArgs,
  PositionExArgs,
  SolautoPositionEx,
} from "./solautoPositionEx";
import { MarginfiSolautoPositionEx } from "./marginfiSolautoPositionEx";

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

export async function getPositionExBulk(
  umi: Umi,
  publicKeys: PublicKey[]
): Promise<SolautoPositionEx[]> {
  const batches = getBatches(publicKeys, 50);

  const data = (
    await Promise.all(
      batches.map(async (pubkeys) => {
        return retryWithExponentialBackoff(
          async () =>
            await safeFetchAllSolautoPosition(
              umi,
              pubkeys.map((x) => fromWeb3JsPublicKey(x))
            )
        );
      })
    )
  ).flat();

  return data.map((x) => {
    switch (x.position.lendingPlatform) {
      case LendingPlatform.Marginfi:
        return new MarginfiSolautoPositionEx({
          umi,
          publicKey: toWeb3JsPublicKey(x.publicKey),
          data: x,
        });
      // TODO: PF
    }
  });
}

export async function getOrCreatePositionEx(
  umi: Umi,
  authority: PublicKey,
  positionId: number,
  programId: PublicKey,
  customArgs?: PositionCustomArgs,
  contextUpdates?: ContextUpdates
): Promise<SolautoPositionEx> {
  const publicKey = getSolautoPositionAccount(authority, positionId, programId);
  const data = await safeFetchSolautoPosition(
    umi,
    fromWeb3JsPublicKey(publicKey)
  );

  const lendingPlatform = data
    ? data.position.lendingPlatform
    : customArgs!.lendingPlatform;

  const args: PositionExArgs = {
    umi,
    publicKey,
    authority,
    positionId,
    programId,
    data: data ?? {
      state: createFakePositionState(
        {
          mint: customArgs?.supplyMint ?? PublicKey.default,
        },
        { mint: customArgs?.debtMint ?? PublicKey.default },
        0,
        0
      ),
    },
    customArgs,
    contextUpdates,
  };

  switch (lendingPlatform) {
    case LendingPlatform.Marginfi:
      return new MarginfiSolautoPositionEx(args);
    // TODO: PF
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
  const supplyDecimals = tokenInfo(supply.mint).decimals;
  const debtDecimals = tokenInfo(debt.mint).decimals;

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
    lastRefreshed: BigInt(currentUnixSeconds()),
    padding1: [],
    padding2: [],
    padding: [],
  };
}
