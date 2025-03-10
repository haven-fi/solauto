import { PublicKey } from "@solana/web3.js";
import { PublicKey as UmiPublicKey } from "@metaplex-foundation/umi";
import { PYTH_PRICE_FEED_IDS } from "../constants/pythConstants";
import { fromBaseUnit, toBaseUnit } from "./numberUtils";
import { PRICES } from "../constants/solautoConstants";
import { SWITCHBOARD_PRICE_FEED_IDS } from "../constants/switchboardConstants";
import {
  consoleLog,
  currentUnixSeconds,
  retryWithExponentialBackoff,
  zip,
} from "./generalUtils";
import * as OnDemand from "@switchboard-xyz/on-demand";
import { getJupPriceData } from "./jupiterUtils";

export async function fetchTokenPrices(mints: PublicKey[]): Promise<number[]> {
  const currentTime = currentUnixSeconds();
  if (
    !mints.some(
      (mint) =>
        !(mint.toString() in PRICES) ||
        currentTime - PRICES[mint.toString()].time > 3
    )
  ) {
    return mints.map((mint) => PRICES[mint.toString()].price);
  }

  const pythMints = mints.filter((x) => x.toString() in PYTH_PRICE_FEED_IDS);
  const switchboardMints = mints.filter(
    (x) => x.toString() in SWITCHBOARD_PRICE_FEED_IDS
  );

  const [pythData, switchboardData] = await Promise.all([
    zip(pythMints, await getPythPrices(pythMints)),
    zip(switchboardMints, await getSwitchboardPrices(switchboardMints)),
  ]);

  const prices = mints.map((mint) => {
    const item = [...pythData, ...switchboardData].find((data) =>
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

export async function getSwitchboardPrices(
  mints: PublicKey[]
): Promise<number[]> {
  if (mints.length === 0) {
    return [];
  }

  const { CrossbarClient } = OnDemand;
  const crossbar = CrossbarClient.default();

  let prices: number[] = [];
  try {
    prices = await retryWithExponentialBackoff(
      async () => {
        const res = await crossbar.simulateSolanaFeeds(
          "mainnet",
          mints.map((x) => SWITCHBOARD_PRICE_FEED_IDS[x.toString()])
        );
  
        const p = res.flatMap((x) => x.results[0]);
        if (p.filter((x) => !x || isNaN(Number(x))).length > 0) {
          throw new Error("Unable to fetch Switchboard prices");
        }
  
        return p;
      },
      2,
      350
    );
  } catch {
    consoleLog("Failed to fetch Switchboard prices after multiple retries");
  }

  if (prices.length === 0) {
    prices = Array(mints.length).fill(0);
  }

  const missingPrices = zip(mints, prices).filter((x) => !x[1] || isNaN(Number(x)));
  const jupPrices = zip(
    missingPrices.map((x) => x[0]),
    await getJupTokenPrices(missingPrices.map((x) => x[0]))
  );

  prices = prices.map((x, i) =>
    x ? x : jupPrices.find((y) => y[0].toString() === mints[i].toString())![1]
  );

  return prices;
}

export async function getJupTokenPrices(mints: PublicKey[]) {
  if (mints.length == 0) {
    return [];
  }

  const data = await getJupPriceData(mints);

  const prices = Object.values(data).map(
    (x) => parseFloat(x.price as string) as number
  );

  return prices;
}

export function safeGetPrice(
  mint: PublicKey | UmiPublicKey | undefined
): number | undefined {
  if (mint && mint?.toString() in PRICES) {
    return PRICES[mint!.toString()].price;
  }
  return undefined;
}
