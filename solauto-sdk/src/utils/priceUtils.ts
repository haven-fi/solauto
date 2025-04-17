import { PublicKey } from "@solana/web3.js";
import { PublicKey as UmiPublicKey } from "@metaplex-foundation/umi";
import * as SwbCommon from "@switchboard-xyz/common";
import {
  PYTH_PRICE_FEED_IDS,
  PRICES,
  SWITCHBOARD_PRICE_FEED_IDS,
} from "../constants";
import { fromBaseUnit, toBaseUnit } from "./numberUtils";
import {
  consoleLog,
  createRecord,
  currentUnixSeconds,
  retryWithExponentialBackoff,
} from "./generalUtils";
import { getJupPriceData } from "./jupiterUtils";
import { PriceType } from "../generated";

interface PriceResult {
  realtimePrice: number;
  emaPrice?: number;
}

export async function fetchTokenPrices(
  mints: PublicKey[],
  priceType: PriceType = PriceType.Realtime
): Promise<number[]> {
  const currentTime = currentUnixSeconds();
  const mintStrs = mints.map((x) => x.toString());
  const cachedPrices: Record<string, PriceResult> = Object.fromEntries(
    Object.entries(PRICES).filter(
      ([mint, price]) =>
        mintStrs.includes(mint) && currentTime - price.time <= 3
    )
  );

  const newMints = mintStrs
    .filter((x) => !Object.keys(cachedPrices).includes(x))
    .map((x) => new PublicKey(x));
  const pythMints = newMints.filter((x) => x.toString() in PYTH_PRICE_FEED_IDS);
  const switchboardMints = newMints.filter(
    (x) => x.toString() in Object.keys(SWITCHBOARD_PRICE_FEED_IDS)
  );
  const otherMints = newMints.filter(
    (x) => !pythMints.includes(x) && !switchboardMints.includes(x)
  );
  const newPrices: Record<string, PriceResult> = Object.assign(
    {},
    ...(await Promise.all([
      getPythPrices(pythMints),
      getSwitchboardPrices(switchboardMints),
      getJupTokenPrices(otherMints),
    ]))
  );

  for (const mint of newMints) {
    const realtimePrice = newPrices[mint.toString()].realtimePrice;
    PRICES[mint.toString()] = {
      realtimePrice,
      emaPrice: newPrices[mint.toString()].emaPrice ?? realtimePrice,
      time: currentUnixSeconds(),
    };
  }

  const prices: Record<string, PriceResult> = {
    ...PRICES,
    ...newPrices,
  };

  return mints.map((x) => {
    const priceResult = prices[x.toString()];
    const realtimePrice = priceResult.realtimePrice;
    return priceType === PriceType.Ema
      ? (priceResult.emaPrice ?? realtimePrice)
      : realtimePrice;
  });
}

export async function getPythPrices(
  mints: PublicKey[]
): Promise<Record<string, PriceResult>> {
  if (mints.length === 0) {
    return {};
  }

  const priceFeedIds = mints.map(
    (mint) => PYTH_PRICE_FEED_IDS[mint.toString()]
  );

  const getReq = async () =>
    await fetch(
      `https://hermes.pyth.network/v2/updates/price/latest?${priceFeedIds.map((x) => `ids%5B%5D=${x}`).join("&")}`
    );

  const derivePrice = (price: number, exponent: number) => {
    if (exponent > 0) {
      return Number(toBaseUnit(Number(price), exponent));
    } else if (exponent < 0) {
      return fromBaseUnit(BigInt(price), Math.abs(exponent));
    } else {
      return Number(price);
    }
  };

  const prices: PriceResult[] = await retryWithExponentialBackoff(
    async () => {
      let resp = await getReq();
      let status = resp.status;
      if (status !== 200) {
        throw new Error(JSON.stringify(resp));
      }

      const json = await resp.json();
      const prices = json.parsed.map((x: any) => {
        return {
          realtimePrice: derivePrice(x.price.price, x.price.expo),
          emaPrice: derivePrice(x.ema_price.price, x.ema_price.expo),
        };
      });

      return prices;
    },
    5,
    200
  );

  return createRecord(
    mints.map((x) => x.toString()),
    prices
  );
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
): Promise<Record<string, PriceResult>> {
  if (mints.length === 0) {
    return {};
  }

  const { CrossbarClient } = SwbCommon;
  const crossbar = CrossbarClient.default();

  let prices: Record<string, PriceResult> = {};
  try {
    prices = await retryWithExponentialBackoff(
      async () => {
        const resp = await crossbar.simulateFeeds(
          mints.map((x) => SWITCHBOARD_PRICE_FEED_IDS[x.toString()].feedHash)
        );

        const prices = resp.flatMap((x) => x.results[0]);
        if (
          prices.filter((x) => !x || isNaN(Number(x)) || Number(x) <= 0)
            .length > 0
        ) {
          throw new Error("Unable to fetch Switchboard prices");
        }

        const finalMap: Record<string, PriceResult> = {};
        for (const item of resp) {
          for (const [k, v] of Object.entries(SWITCHBOARD_PRICE_FEED_IDS)) {
            if (item.feedHash === v.feedHash) {
              finalMap[k] = { realtimePrice: Number(item.results[0]) };
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
  const jupPrices = await getJupTokenPrices(
    missingMints.map((x) => new PublicKey(x))
  );

  return { ...prices, ...jupPrices };
}

export async function getJupTokenPrices(
  mints: PublicKey[]
): Promise<Record<string, PriceResult>> {
  if (mints.length == 0) {
    return {};
  }

  const data = getSortedPriceData(await getJupPriceData(mints), mints);

  const prices: Record<string, PriceResult> = Object.fromEntries(
    Object.entries(data).map(([mint, x]) => [
      mint,
      x !== null && typeof x === "object" && "price" in x
        ? { realtimePrice: parseFloat(x.price as string) }
        : { realtimePrice: 0 },
    ])
  );

  return prices;
}

export function safeGetPrice(
  mint: PublicKey | UmiPublicKey | string | undefined,
  priceType: PriceType = PriceType.Realtime
): number | undefined {
  if (mint && mint?.toString() in PRICES) {
    const priceData = PRICES[mint!.toString()];
    return priceType === PriceType.Ema
      ? priceData.emaPrice
      : priceData.realtimePrice;
  }
  return undefined;
}
