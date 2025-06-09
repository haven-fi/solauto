import axios from "axios";
import { PublicKey } from "@solana/web3.js";
import {
  MaybeRpcAccount,
  publicKey,
  Umi,
  PublicKey as UmiPublicKey,
} from "@metaplex-foundation/umi";
import { TOKEN_INFO, TokenInfo } from "../constants";

export function buildHeliusApiUrl(heliusApiKey: string) {
  return `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
}

export function buildIronforgeApiUrl(ironforgeApiKey: string) {
  return `https://rpc.ironforge.network/mainnet?apiKey=${ironforgeApiKey}`;
}

export function consoleLog(...args: any[]): void {
  if ((globalThis as any).SHOW_LOGS) {
    console.log(...args);
  }
}

export function tokenInfo(mint?: PublicKey): TokenInfo {
  return TOKEN_INFO[mint ? mint.toString() : PublicKey.default.toString()];
}

export function findMintByTicker(ticker: string): PublicKey {
  for (const key in TOKEN_INFO) {
    const account = TOKEN_INFO[key];
    if (
      account.ticker.toString().toLowerCase() ===
      ticker.toString().toLowerCase()
    ) {
      return new PublicKey(key);
    }
  }
  throw new Error(`Token mint not found by the ticker: ${ticker}`);
}

export function tokenInfoByTicker(ticker: string) {
  for (const key in TOKEN_INFO) {
    const token = TOKEN_INFO[key];
    if (token.ticker.toLowerCase() === ticker.toLowerCase()) {
      return token;
    }
  }
  return undefined;
}

export function getBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
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
            errorsToThrow?.length &&
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

export function toEnumValue<E extends object>(
  enumObj: E,
  value: number
): E[keyof E] | undefined {
  const numericValues = Object.values(enumObj).filter(
    (v) => typeof v === "number"
  ) as number[];

  if (numericValues.includes(value)) {
    return value as E[keyof E];
  }

  return undefined;
}

export async function customRpcCall(umi: Umi, method: string, params?: any) {
  const data = (
    await axios.post(
      umi.rpc.getEndpoint(),
      {
        jsonrpc: "2.0",
        id: 1,
        method,
        params,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    )
  ).data;

  if ("result" in data) {
    return data.result;
  } else {
    if ("error" in data) {
      console.log(JSON.stringify(data.error));
    }
    return data;
  }
}

export function u16ToArrayBufferLE(value: number): Uint8Array {
  // Create a buffer of 2 bytes
  const buffer = new ArrayBuffer(2);
  const dataView = new DataView(buffer);

  // Set the Uint16 value in little-endian order
  dataView.setUint16(0, value, true);

  // Return the buffer
  return new Uint8Array(buffer);
}

export function validPubkey(pubkey?: PublicKey | UmiPublicKey | string) {
  return Boolean(pubkey) && pubkey!.toString() !== PublicKey.default.toString();
}

export function createRecord<T>(
  keys: string[],
  values: T[]
): Record<string, T> {
  return Object.fromEntries(
    zip(keys, values).map(([k, v]) => [k.toString(), v])
  );
}
