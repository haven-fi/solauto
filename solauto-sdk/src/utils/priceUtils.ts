import { PublicKey } from "@solana/web3.js";
import { PublicKey as UmiPublicKey } from "@metaplex-foundation/umi";
import { PYTH_PRICE_FEED_IDS } from "../constants/pythConstants";
import { fromBaseUnit, toBaseUnit, toBps } from "./numberUtils";
import { PRICES } from "../constants/solautoConstants";
import { SWITCHBOARD_PRICE_FEED_IDS } from "../constants/switchboardConstants";
import {
  consoleLog,
  currentUnixSeconds,
  retryWithExponentialBackoff,
  zip,
} from "./generalUtils";
import * as SwbCommon from "@switchboard-xyz/common";
import { getJupPriceData } from "./jupiterUtils";

export async function fetchTokenPrices(mints: PublicKey[]): Promise<number[]> {
  const currentTime = currentUnixSeconds();
  if (
    !mints.some(
      (mint) =>
        !(mint.toString() in PRICES) ||
        currentTime - PRICES[mint.toString()].time > 5
    )
  ) {
    return mints.map((mint) => PRICES[mint.toString()].price);
  }

  const pythMints = mints.filter((x) => x.toString() in PYTH_PRICE_FEED_IDS);
  const switchboardMints = mints.filter(
    (x) => x.toString() in SWITCHBOARD_PRICE_FEED_IDS
  );
  const otherMints = mints.filter(
    (x) => !pythMints.includes(x) && !switchboardMints.includes(x)
  );

  const [pythData, switchboardData, jupData] = await Promise.all([
    zip(pythMints, await getPythPrices(pythMints)),
    zip(switchboardMints, await getSwitchboardPrices(switchboardMints)),
    zip(otherMints, await getJupTokenPrices(otherMints, true)),
  ]);

  const prices = mints.map((mint) => {
    const item = [...pythData, ...switchboardData, ...jupData].find((data) =>
      data[0].equals(mint)
    );
    return item ? item[1] : 0;
  });

  for (var i = 0; i < mints.length; i++) {
    PRICES[mints[i].toString()] = {
      price: Number(prices[i]),
      time: currentUnixSeconds(),
    };
  }

  return prices;
}

export async function getPythPrices(mints: PublicKey[]) {
  if (mints.length === 0) {
    return [];
  }

  const priceFeedIds = mints.map(
    (mint) => PYTH_PRICE_FEED_IDS[mint.toString()]
  );

  const getReq = async () =>
    await fetch(
      `https://hermes.pyth.network/v2/updates/price/latest?${priceFeedIds.map((x) => `ids%5B%5D=${x}`).join("&")}`
    );

  const prices: number[] = await retryWithExponentialBackoff(
    async () => {
      let resp = await getReq();
      let status = resp.status;
      if (status !== 200) {
        throw new Error(JSON.stringify(resp));
      }

      const json = await resp.json();
      const prices = json.parsed.map((x: any) => {
        if (x.price.expo > 0) {
          return Number(toBaseUnit(Number(x.price.price), x.price.expo));
        } else if (x.price.expo < 0) {
          return fromBaseUnit(BigInt(x.price.price), Math.abs(x.price.expo));
        } else {
          return Number(x.price.price);
        }
      });

      return prices;
    },
    5,
    200
  );

  return prices;
}

function getSortedPriceData(
  prices: Record<string, number>,
  mints: PublicKey[]
) {
  const sortedPrices: { [key: string]: any } = {};

  for (const mint of mints) {
    const key = mint.toString();
    if (prices.hasOwnProperty(key)) {
      sortedPrices[key] = prices[key];
    }
  }

  return sortedPrices;
}

export async function getSwitchboardPrices(
  mints: PublicKey[]
): Promise<number[]> {
  if (mints.length === 0) {
    return [];
  }

  const { CrossbarClient } = SwbCommon;
  const crossbar = CrossbarClient.default();

  let prices: Record<string, number> = {};
  try {
    prices = await retryWithExponentialBackoff(
      async () => {
        const resp = await crossbar.simulateSolanaFeeds(
          "mainnet",
          mints.map((x) => SWITCHBOARD_PRICE_FEED_IDS[x.toString()])
        );

        const prices = resp.flatMap((x) => x.results[0]);
        if (
          prices.filter((x) => !x || isNaN(Number(x)) || Number(x) <= 0)
            .length > 0
        ) {
          throw new Error("Unable to fetch Switchboard prices");
        }

        const finalMap: Record<string, number> = {};
        for (const item of resp) {
          for (const [k, v] of Object.entries(SWITCHBOARD_PRICE_FEED_IDS)) {
            if (item.feed === v) {
              finalMap[k] = Number(item.results[0]);
            }
          }
        }
        return finalMap;
      },
      2,
      350
    );
  } catch {
    consoleLog("Failed to fetch Switchboard prices after multiple retries");
  }

  const missingMints = mints.filter((x) => !prices[x.toString()]);
  const jupPrices = zip(
    missingMints,
    await getJupTokenPrices(missingMints.map((x) => new PublicKey(x)))
  ).reduce(
    (acc, [key, value]) => {
      acc[key.toString()] = value;
      return acc;
    },
    {} as Record<string, number>
  );

  return Object.values(getSortedPriceData({ ...prices, ...jupPrices }, mints));
}

export async function getJupTokenPrices(
  mints: PublicKey[],
  mayIncludeSpamTokens?: boolean
) {
  if (mints.length == 0) {
    return [];
  }

  const data = getSortedPriceData(
    await getJupPriceData(mints, mayIncludeSpamTokens),
    mints
  );

  return Object.values(data).map((x) =>
    x !== null && typeof x === "object" && "price" in x
      ? parseFloat(x.price as string)
      : 0
  );
}

export function safeGetPrice(
  mint: PublicKey | UmiPublicKey | string | undefined
): number | undefined {
  if (mint && mint?.toString() in PRICES) {
    return PRICES[mint!.toString()].price;
  }
  return undefined;
}
