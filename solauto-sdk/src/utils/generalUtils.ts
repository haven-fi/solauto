import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  MaybeRpcAccount,
  publicKey,
  Umi,
  PublicKey as UmiPublicKey,
} from "@metaplex-foundation/umi";
import { PYTH_PRICE_FEED_IDS } from "../constants/pythConstants";
import { fromBaseUnit, toBaseUnit } from "./numberUtils";
import { PRICES } from "../constants/solautoConstants";
import {
  PullFeed,
} from "@switchboard-xyz/on-demand";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import switchboardIdl from "../idls/switchboard.json";
import { SWITCHBOARD_PRICE_FEED_IDS } from "../constants/switchboardConstants";

export function consoleLog(...args: any[]): void {
  if ((globalThis as any).LOCAL_TEST) {
    console.log(...args);
  }
}
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
  const account = await umi.rpc.getAccount(publicKey(pk), {
    commitment: "confirmed",
  });
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

export function zip<T, U>(list1: T[], list2: U[]): [T, U][] {
  const minLength = Math.min(list1.length, list2.length);
  const result: [T, U][] = [];

  for (let i = 0; i < minLength; i++) {
    result.push([list1[i], list2[i]]);
  }

  return result;
}

export async function fetchTokenPrices(
  conn: Connection,
  mints: PublicKey[]
): Promise<number[]> {
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
    zip(switchboardMints, await getSwitchboardPrices(conn, switchboardMints)),
  ]);

  const prices = mints.map((mint) => {
    const item = [...pythData, ...switchboardData].find((data) =>
      data[0].equals(mint)
    );
    return item ? item[1] : 0;
  });

  for (var i = 0; i < mints.length; i++) {
    PRICES[mints[i].toString()] = {
      price: prices[i],
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
  conn: Connection,
  mints: PublicKey[]
) {
  if (mints.length === 0) {
    return [];
  }

  const dummyWallet = {
    publicKey: new PublicKey("11111111111111111111111111111111"),
    signTransaction: async <T extends Transaction | VersionedTransaction>(
      tx: T
    ): Promise<T> => tx,
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(
      txs: T[]
    ): Promise<T[]> => txs,
  };
  const provider = new AnchorProvider(
    conn,
    dummyWallet,
    AnchorProvider.defaultOptions()
  );
  const program = new Program(switchboardIdl as Idl, provider);

  const results = await Promise.all(
    mints.map(async (mint) => {
      const feed = new PullFeed(
        program,
        new PublicKey(SWITCHBOARD_PRICE_FEED_IDS[mint.toString()])
      );
      const result = await feed.loadData();
      return Number(result.result.value) / Math.pow(10, 18);
    })
  );

  return results;
}

export function safeGetPrice(
  mint: PublicKey | UmiPublicKey | undefined
): number | undefined {
  if (mint && mint?.toString() in PRICES) {
    return PRICES[mint!.toString()].price;
  }
  return undefined;
}

export type ErrorsToThrow = Array<new (...args: any[]) => Error>;

export function retryWithExponentialBackoff<T>(
  fn: (attemptNum: number, prevErr?: Error) => Promise<T>,
  retries: number = 5,
  delay: number = 150,
  errorsToThrow?: ErrorsToThrow
): Promise<T> {
  return new Promise((resolve, reject) => {
    const attempt = (attemptNum: number, prevErr?: Error) => {
      fn(attemptNum, prevErr)
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
            consoleLog(error);
            setTimeout(() => {
              consoleLog("Retrying...");
              return attempt(attemptNum, error);
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
