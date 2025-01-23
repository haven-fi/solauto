import { publicKey } from "@metaplex-foundation/umi";
import {
  buildHeliusApiUrl,
  fetchTokenPrices,
  fromBaseUnit,
  getSolanaRpcConnection,
  getSolautoManagedPositions,
  PositionState,
  positionStateWithLatestPrices,
  retryWithExponentialBackoff,
  safeFetchAllSolautoPosition,
  safeGetPrice,
  SOLAUTO_PROD_PROGRAM,
  TOKEN_INFO,
  USD_DECIMALS,
} from "../src";
import { PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import path from "path";
import { config } from "dotenv";
import { safeFetchMarginfiAccount } from "../src/marginfi-sdk";

config({ path: path.join(__dirname, ".env") });

function getBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

export function tokenInfo(mint?: PublicKey) {
  return TOKEN_INFO[mint ? mint.toString() : PublicKey.default.toString()];
}

type StrategyType = "Long" | "Short";

function solautoStrategyName(supplyMint?: PublicKey, debtMint?: PublicKey) {
  const supplyInfo = tokenInfo(supplyMint);
  const debtInfo = tokenInfo(debtMint);
  const strat = strategyType(
    supplyMint ?? PublicKey.default,
    debtMint ?? PublicKey.default
  );

  if (strat === "Long") {
    return debtInfo.isStableCoin
      ? `${supplyInfo.ticker} Long`
      : supplyInfo.ticker
        ? `${supplyInfo.ticker}/${debtInfo.ticker} Long`
        : "";
  } else {
    return `${debtInfo.ticker} Short`;
  }
}

function strategyType(
  supplyMint: PublicKey,
  debtMint: PublicKey
): StrategyType {
  const supplyInfo = tokenInfo(supplyMint);
  const debtInfo = tokenInfo(debtMint);

  if (supplyInfo.isLST && debtMint.equals(NATIVE_MINT)) {
    // Yield
    throw new Error("Not yet supported");
  } else if (debtInfo.isStableCoin) {
    return "Long";
  } else if (supplyInfo.isStableCoin) {
    return "Short";
  } else {
    return "Long";
  }
}

export function roundToDecimals(value: number, decimals: number = 2): number {
  if (!value || isNaN(value)) {
    return value;
  }

  let roundedValue: number | undefined;
  do {
    const factor = Math.pow(10, decimals ?? 2);
    roundedValue = Math.round(value * factor) / factor;
    decimals += 1;
  } while (!roundedValue || decimals >= 10);

  return roundedValue;
}

export function formatNumberToShortForm(
  num: number,
  decimals?: number
): string {
  if (decimals === undefined) {
    decimals = 1;
  }
  if (num >= 1_000_000_000) {
    return (
      (num / 1_000_000_000)
        .toFixed(decimals)
        .replace(new RegExp(`\\.0{${decimals}}$`), "") + "B"
    );
  }
  if (num >= 1_000_000) {
    return (
      (num / 1_000_000)
        .toFixed(decimals)
        .replace(new RegExp(`\\.0{${decimals}}$`), "") + "M"
    );
  }
  if (num >= 1_000) {
    return (
      (num / 1_000)
        .toFixed(decimals)
        .replace(new RegExp(`\\.0{${decimals}}$`), "") + "K"
    );
  }
  return num.toFixed(decimals).replace(new RegExp(`\\.0{${decimals}}$`), "");
}

export function formatNumber(
  num: number,
  decimals?: number,
  shortFormAtThreshold?: number,
  decimalsAtShortform?: number
): string {
  if (shortFormAtThreshold !== undefined && num > shortFormAtThreshold) {
    return formatNumberToShortForm(num, decimalsAtShortform);
  } else {
    return num < 1
      ? roundToDecimals(num, decimals).toString()
      : new Intl.NumberFormat("en-US").format(
          decimals !== undefined ? roundToDecimals(num, decimals) : num
        );
  }
}

async function main(filterWhitelist: boolean) {
  const [_, umi] = getSolanaRpcConnection(
    buildHeliusApiUrl(process.env.HELIUS_API_KEY!),
    SOLAUTO_PROD_PROGRAM
  );

  let positions = await getSolautoManagedPositions(umi);

  if (filterWhitelist) {
    const addressWhitelist = process.env.ADDRESS_WHITELIST?.split(",") ?? [];
    positions = positions.filter(
      (x) => !addressWhitelist.includes(x.authority.toString())
    );
  }

  const batches = getBatches(positions, 30);

  const solautoPositionsData = (
    await Promise.all(
      batches.map(async (pubkeys) => {
        return retryWithExponentialBackoff(
          async () =>
            await safeFetchAllSolautoPosition(
              umi,
              pubkeys.map((x) => publicKey(x.publicKey!))
            )
        );
      })
    )
  ).flat();

  const tokensUsed = Array.from(
    new Set(
      positions.flatMap((x) => [
        x.supplyMint!.toString(),
        x.debtMint!.toString(),
      ])
    )
  );

  const tokenBatches = getBatches(tokensUsed, 15);
  await Promise.all(
    tokenBatches.map(async (batch) => {
      await fetchTokenPrices(batch.map((x) => new PublicKey(x)));
    })
  );

  console.log("\n\n");

  const latestStates: PositionState[] = [];
  let unhealthyPositions = 0;
  for (const pos of solautoPositionsData) {
    const latestState = await positionStateWithLatestPrices(
      pos.state,
      safeGetPrice(pos.state.supply.mint),
      safeGetPrice(pos.state.debt.mint)
    );
    latestStates.push(latestState);

    const strategy = solautoStrategyName(
      toWeb3JsPublicKey(pos.state.supply.mint),
      toWeb3JsPublicKey(pos.state.debt.mint)
    );

    const repayFrom = pos.position.settingParams.repayToBps + pos.position.settingParams.repayGap;
    const unhealthy = pos.state.liqUtilizationRateBps > repayFrom;
    const healthText = unhealthy ? `(Unhealthy: ${pos.state.liqUtilizationRateBps - repayFrom}` : "";
    if (unhealthy) {
      unhealthyPositions += 1;
    }

    console.log(pos.publicKey.toString(), `(${pos.authority.toString()})`);
    console.log(
      `${strategy}: $${formatNumber(fromBaseUnit(latestState.netWorth.baseAmountUsdValue, USD_DECIMALS), 2, 10000, 2)} ${healthText}`
    );
  }

  console.log("\nTotal positions:", solautoPositionsData.length, unhealthyPositions ? ` (unhealthy: ${unhealthyPositions})` : "");
  console.log(
    "Total users:",
    Array.from(new Set(solautoPositionsData.map((x) => x.authority.toString())))
      .length
  );

  const tvl = latestStates
    .map((x) => fromBaseUnit(x.netWorth.baseAmountUsdValue, USD_DECIMALS))
    .reduce((acc, curr) => acc + curr, 0);
  console.log(`Total TVL: $${formatNumber(tvl, 2, 10000, 2)}`);
}

const filterWhitelist = true;
main(filterWhitelist).then((x) => x);