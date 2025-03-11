import { publicKey } from "@metaplex-foundation/umi";
import {
  buildHeliusApiUrl,
  calcNetWorthUsd,
  calcSupplyUsd,
  currentUnixSeconds,
  eligibleForRebalance,
  fetchTokenPrices,
  getSolanaRpcConnection,
  getSolautoManagedPositions,
  PositionState,
  positionStateWithLatestPrices,
  retryWithExponentialBackoff,
  safeFetchAllSolautoPosition,
  safeGetPrice,
  SOLAUTO_PROD_PROGRAM,
  solautoStrategyName,
} from "../src";
import { PublicKey } from "@solana/web3.js";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import path from "path";
import { config } from "dotenv";

config({ path: path.join(__dirname, ".env") });

function getBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
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
  )
    .flat()
    .sort((a, b) => calcNetWorthUsd(a.state) - calcNetWorthUsd(b.state));

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
  let awaitingBoostPositions = 0;

  for (const pos of solautoPositionsData) {
    const strategy = solautoStrategyName(
      toWeb3JsPublicKey(pos.state.supply.mint),
      toWeb3JsPublicKey(pos.state.debt.mint)
    );

    const latestState = await positionStateWithLatestPrices(
      pos.state,
      safeGetPrice(pos.state.supply.mint),
      safeGetPrice(pos.state.debt.mint)
    );
    latestStates.push(latestState);

    const actionToTake = eligibleForRebalance(
      latestState,
      pos.position.settingParams,
      pos.position.dca,
      currentUnixSeconds(),
      safeGetPrice(latestState.supply.mint)!,
      safeGetPrice(latestState.debt.mint)!,
      0
    );

    const repayFrom =
      pos.position.settingParams.repayToBps +
      pos.position.settingParams.repayGap;
    const unhealthy = actionToTake === "repay";
    const healthText = unhealthy
      ? `(Unhealthy: ${latestState.liqUtilizationRateBps - repayFrom}bps)`
      : "";
    if (unhealthy) {
      unhealthyPositions += 1;
    }

    const awaitingBoost = actionToTake === "boost";
    const boostText = awaitingBoost ? " (awaiting boost)" : "";
    if (awaitingBoost) {
      awaitingBoostPositions += 1;
    }

    console.log(
      pos.publicKey.toString(),
      `(${pos.authority.toString()} ${pos.positionId})`
    );
    console.log(
      `${strategy}: $${formatNumber(calcNetWorthUsd(latestState), 2, 10000, 2)} ${healthText} ${boostText}`
    );
  }

  console.log(
    "\nTotal positions:",
    solautoPositionsData.length,
    unhealthyPositions ? ` (unhealthy: ${unhealthyPositions})` : "",
    awaitingBoostPositions ? ` (awaiting boost: ${awaitingBoostPositions})` : ""
  );
  console.log(
    "Total users:",
    Array.from(new Set(solautoPositionsData.map((x) => x.authority.toString())))
      .length
  );

  const tvl = latestStates
    .map((x) => calcSupplyUsd(x))
    .reduce((acc, curr) => acc + curr, 0);
  const netWorth = latestStates
    .map((x) => calcNetWorthUsd(x))
    .reduce((acc, curr) => acc + curr, 0);

  console.log(`TVL: $${formatNumber(tvl, 2, 10000, 2)}`);
  console.log(`Total net worth: $${formatNumber(netWorth, 2, 10000, 2)}`);
}

const filterWhitelist = true;
main(filterWhitelist).then((x) => x);
