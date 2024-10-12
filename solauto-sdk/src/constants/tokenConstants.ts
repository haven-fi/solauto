import { NATIVE_MINT } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

// When adding token ensure a price feed is provided in pythConstants.ts & the token is in TOKEN_INFO
export const B_SOL = "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1";
export const JITO_SOL = "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn";
export const LST = "LSTxxxnJzKDFSLr4dUkPcmCf5VyryEqzPLz5j4bpxFp";
export const M_SOL = "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So";
export const INF = "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm";
export const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
export const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
export const JTO = "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL";
export const JLP = "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4";
export const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

export const ALL_SUPPORTED_TOKENS = [
  NATIVE_MINT.toString(),
  B_SOL,
  JITO_SOL,
  LST,
  M_SOL,
  INF,
  JUP,
  BONK,
  JTO,
  JLP,
  USDC,
  USDT,
];

interface TokenInfo {
  ticker: string;
  decimals: number;
  isStableCoin?: boolean;
  isLST?: boolean;
}

export const TOKEN_INFO: { [key: string]: TokenInfo } = {
  [PublicKey.default.toString()]: {
    ticker: "",
    decimals: 1,
  },
  [NATIVE_MINT.toString()]: {
    ticker: "SOL",
    decimals: 9,
  },
  [B_SOL]: {
    ticker: "bSOL",
    decimals: 9,
    isLST: true,
  },
  [JITO_SOL]: {
    ticker: "JitoSOL",
    decimals: 9,
    isLST: true,
  },
  [LST]: {
    ticker: "LST",
    decimals: 9,
    isLST: true,
  },
  [M_SOL]: {
    ticker: "mSOL",
    decimals: 9,
    isLST: true,
  },
  [INF]: {
    ticker: "INF",
    decimals: 9,
    isLST: true
  },
  [JUP]: {
    ticker: "JUP",
    decimals: 6,
  },
  [BONK]: {
    ticker: "BONK",
    decimals: 5,
  },
  [JTO]: {
    ticker: "JTO",
    decimals: 9
  },
  [JLP]: {
    ticker: "JLP",
    decimals: 6
  },
  [USDC]: {
    ticker: "USDC",
    decimals: 6,
    isStableCoin: true,
  },
  [USDT]: {
    ticker: "USDT",
    decimals: 6,
    isStableCoin: true,
  },
};
