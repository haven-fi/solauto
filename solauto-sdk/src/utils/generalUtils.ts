import { PublicKey } from "@solana/web3.js";
import { MaybeRpcAccount, publicKey, Umi, PublicKey as UmiPublicKey } from "@metaplex-foundation/umi";
import { PYTH_PRICE_FEED_IDS } from "../constants/pythConstants";
import { fromBaseUnit, toBaseUnit } from "./numberUtils";
import { PRICES } from "../constants/solautoConstants";

export function generateRandomU8(): number {
  return Math.floor(Math.random() * 255 + 1);
}

export function generateRandomU64(): bigint {
  const upperBound = 2n ** 64n;
  let result = 0n;
  for (let i = 0; i < 64; i += 8) {
    result |= BigInt(Math.floor(Math.random() * 256)) << BigInt(i);
  }
  return result % upperBound;
}

export function currentUnixSeconds(): number {
  return Math.round(new Date().getTime() / 1000);
}

export async function getSolanaAccountCreated(
  umi: Umi,
  pk: PublicKey
): Promise<boolean> {
  const account = await umi.rpc.getAccount(publicKey(pk), { commitment: "confirmed" });
  return rpcAccountCreated(account);
}

export function rpcAccountCreated(account: MaybeRpcAccount): boolean {
  return account.exists && account.data.length > 0;
}

export function arraysAreEqual(arrayA: number[], arrayB: number[]): boolean {
  if (arrayA.length !== arrayB.length) {
    return false;
  }
  for (let i = 0; i < arrayA.length; i++) {
    if (arrayA[i] !== arrayB[i]) {
      return false;
    }
  }
  return true;
}

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

  const priceFeedIds = mints.map(
    (mint) => PYTH_PRICE_FEED_IDS[mint.toString()]
  );

  const getReq = async () =>
    await fetch(
      `https://hermes.pyth.network/v2/updates/price/latest?${priceFeedIds.map((x) => `ids%5B%5D=${x}`).join("&")}`
    );
  let resp = await getReq();
  let status = resp.status;
  while (status !== 200) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    resp = await getReq();
    status = resp.status;
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

  for (var i = 0; i < mints.length; i++) {
    PRICES[mints[i].toString()] = {
      price: prices[i],
      time: currentUnixSeconds(),
    };
  }

  return prices;
}

export function safeGetPrice(mint: PublicKey | UmiPublicKey | undefined): number | undefined {
  if (mint && mint?.toString() in PRICES) {
    return PRICES[mint!.toString()].price;
  }
  return undefined;
}

export type ErrorsToThrow = Array<new (...args: any[]) => Error>;

export function retryWithExponentialBackoff<T>(
  fn: (attemptNum: number) => Promise<T>,
  retries: number = 5,
  delay: number = 150,
  errorsToThrow?: ErrorsToThrow
): Promise<T> {
  return new Promise((resolve, reject) => {
    const attempt = (attemptNum: number) => {
      fn(attemptNum)
        .then(resolve)
        .catch((error: Error) => {
          attemptNum++;

          if (
            errorsToThrow &&
            errorsToThrow.some((errorType) => error instanceof errorType)
          ) {
            reject(error);
            return;
          }

          if (attemptNum < retries) {
            console.log(error);
            setTimeout(() => {
              console.log("Retrying...");
              return attempt(attemptNum);
            }, delay);
            delay *= 2;
          } else {
            reject(error);
          }
        });
    };
    return attempt(0);
  });
}
