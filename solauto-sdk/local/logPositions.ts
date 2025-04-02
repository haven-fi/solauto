import {
  buildIronforgeApiUrl,
  fetchTokenPrices,
  getPositionExBulk,
  getSolanaRpcConnection,
  getSolautoManagedPositions,
  safeGetPrice,
  SOLAUTO_PROD_PROGRAM,
} from "../src";
import { PublicKey } from "@solana/web3.js";
import path from "path";
import { config } from "dotenv";

config({ path: path.join(__dirname, ".env") });

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
    buildIronforgeApiUrl(process.env.IRONFORGE_API_KEY!),
    SOLAUTO_PROD_PROGRAM
  );

  let positions = await getSolautoManagedPositions(umi);

  if (filterWhitelist) {
    const addressWhitelist = process.env.ADDRESS_WHITELIST?.split(",") ?? [];
    positions = positions.filter(
      (x) => !addressWhitelist.includes(x.authority.toString())
    );
  }

  const positionsEx = (
    await getPositionExBulk(
      umi,
      positions.map((x) => new PublicKey(x.publicKey!))
    )
  ).sort((a, b) => a.netWorthUsd() - b.netWorthUsd());

  const tokensUsed = Array.from(
    new Set(
      positions.flatMap((x) => [
        x.supplyMint!.toString(),
        x.debtMint!.toString(),
      ])
    )
  );
  await fetchTokenPrices(tokensUsed.map((x) => new PublicKey(x)));

  console.log("\n\n");

  let unhealthyPositions = 0;
  let awaitingBoostPositions = 0;

  for (const pos of positionsEx) {
    await pos.updateWithLatestPrices(
      safeGetPrice(pos.state().supply.mint),
      safeGetPrice(pos.state().debt.mint)
    );

    const actionToTake = pos.eligibleForRebalance(0);

    const repayFrom = pos.settings()!.repayToBps + pos.settings()!.repayGap;
    const unhealthy = actionToTake === "repay";
    const healthText = unhealthy
      ? `(Unhealthy: ${pos.state().liqUtilizationRateBps - repayFrom}bps)`
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
      `(${pos.data.authority!.toString()} ${pos.data.positionId})`
    );
    console.log(
      `${pos.strategyName()}: $${formatNumber(pos.netWorthUsd(), 2, 10000, 2)} ${healthText} ${boostText}`
    );
  }

  console.log(
    "\nTotal positions:",
    positionsEx.length,
    unhealthyPositions ? ` (unhealthy: ${unhealthyPositions})` : "",
    awaitingBoostPositions ? ` (awaiting boost: ${awaitingBoostPositions})` : ""
  );
  console.log(
    "Total users:",
    Array.from(new Set(positionsEx.map((x) => x.data.authority!.toString())))
      .length
  );

  const tvl = positionsEx
    .map((x) => x.supplyUsd())
    .reduce((acc, curr) => acc + curr, 0);
  const netWorth = positionsEx
    .map((x) => x.netWorthUsd())
    .reduce((acc, curr) => acc + curr, 0);

  console.log(`TVL: $${formatNumber(tvl, 2, 10000, 2)}`);
  console.log(`Total net worth: $${formatNumber(netWorth, 2, 10000, 2)}`);
}

const filterWhitelist = true;
main(filterWhitelist).then((x) => x);
