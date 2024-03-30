import { SolendAccounts } from "./types";
import { PublicKey } from "@solana/web3.js";

const MAINNET_MAIN_POOL: SolendAccounts = {
  solendProgram: new PublicKey("So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo"),
  lendingMarket: new PublicKey("4UpD2fh7xH3VP9QQaXtsS1YY3bxzWhtfpks7FatyKvdY"),
  pythProgram: new PublicKey("FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH"),
  switchboardProgram: new PublicKey("DtmE9D2CSB4L5D6A15mraeEjrGMm6auWVzgaD8hK2tZM"),
  solReserve: {
    reserve: new PublicKey("8PbodeaosQP19SjYFx855UMqWxH2HynZLdBXmsrbac36"),
    pythPrice: new PublicKey("H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG"),
    switchboardPrice: new PublicKey("GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR"),
    liquidityTokenMint: new PublicKey("So11111111111111111111111111111111111111112"),
    collateralTokenMint: new PublicKey("5h6ssFpeDeRbzsEHDbTQNH7nVGgsKrZydxdSTnLm6QdV")
  },
  usdcReserve: {
    reserve: new PublicKey("BgxfHJDzm44T7XG68MYKx7YisTjZu73tVovyZSjJMpmw"),
    pythPrice: new PublicKey("Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD"),
    switchboardPrice: new PublicKey("BjUgj6YCnFBZ49wF54ddBVA9qu8TeqkFtkbqmZcee8uW"),
    liquidityTokenMint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
  },
};

const MAINNET_TURBO_POOL: SolendAccounts = {
  solendProgram: new PublicKey("So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo"),
  lendingMarket: new PublicKey("7RCz8wb6WXxUhAigok9ttgrVgDFFFbibcirECzWSBauM"),
  pythProgram: new PublicKey("FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH"),
  switchboardProgram: new PublicKey("DtmE9D2CSB4L5D6A15mraeEjrGMm6auWVzgaD8hK2tZM"),
  solReserve: {
    reserve: new PublicKey("UTABCRXirrbpCNDogCoqEECtM3V44jXGCsK23ZepV3Z"),
    pythPrice: new PublicKey("H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG"),
    switchboardPrice: new PublicKey("GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR"),
    liquidityTokenMint: new PublicKey("So11111111111111111111111111111111111111112"),
    collateralTokenMint: new PublicKey("AVxnqyCameKsKTCGVKeyJMA7vjHnxJit6afC8AM9MdMj")
  },
  usdcReserve: {
    reserve: new PublicKey("EjUgEaPpKMg2nqex9obb46gZQ6Ar9mWSdVKbw9A6PyXA"),
    pythPrice: new PublicKey("Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD"),
    switchboardPrice: new PublicKey("BjUgj6YCnFBZ49wF54ddBVA9qu8TeqkFtkbqmZcee8uW"),
    liquidityTokenMint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
  },
};

export function getSolendAccounts(pool: "main" | "turbo"): SolendAccounts {
  if (pool === "main") {
    return MAINNET_MAIN_POOL;
  } else if (pool === "turbo") {
    return MAINNET_TURBO_POOL;
  } else {
    throw new Error("Unsupported account parameters");
  }
}
