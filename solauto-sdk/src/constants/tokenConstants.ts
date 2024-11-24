import { NATIVE_MINT } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

// When adding token ensure a price feed is provided in pythConstants.ts & the token is in TOKEN_INFO
export const B_SOL = "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1";
export const JITO_SOL = "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn";
export const LST = "LSTxxxnJzKDFSLr4dUkPcmCf5VyryEqzPLz5j4bpxFp";
export const M_SOL = "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So";
export const INF = "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm";
export const H_SOL = "he1iusmfkpAdwvxLNGV8Y1iSbj4rUy6yMhEA3fotn9A";
export const JUP_SOL = "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v";
export const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
export const JTO = "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL";
export const JLP = "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4";
export const WBTC = "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh";
export const WETH = "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs";
export const HNT = "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux";
export const PYTH = "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3";
export const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
export const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
export const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
export const POPCAT = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";
export const RETARDIO = "6ogzHhzdrQr9Pgv6hZ2MNze7UrzBMAFyBBWUYp1Fhitx";
export const BILLY = "3B5wuUrMEi5yATD7on46hKfej3pfmd7t1RKgrsN3pump";

export const ALL_SUPPORTED_TOKENS = [
  NATIVE_MINT.toString(),
  B_SOL,
  M_SOL,
  JITO_SOL,
  LST,
  INF,
  H_SOL,
  JUP_SOL,
  JUP,
  JTO,
  JLP,
  WBTC,
  WETH,
  HNT,
  PYTH,
  USDC,
  USDT,
  BONK,
  WIF,
  POPCAT,
  RETARDIO,
  BILLY,
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
  [M_SOL]: {
    ticker: "mSOL",
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
  [INF]: {
    ticker: "INF",
    decimals: 9,
    isLST: true,
  },
  [H_SOL]: {
    ticker: "hSOL",
    decimals: 9,
  },
  [JUP_SOL]: {
    ticker: "JupSOL",
    decimals: 9,
  },
  [JUP]: {
    ticker: "JUP",
    decimals: 6,
  },
  [JTO]: {
    ticker: "JTO",
    decimals: 9,
  },
  [JLP]: {
    ticker: "JLP",
    decimals: 6,
  },
  [WBTC]: {
    ticker: "WBTC",
    decimals: 8,
  },
  [WETH]: {
    ticker: "WETH",
    decimals: 8,
  },
  [HNT]: {
    ticker: "HNT",
    decimals: 8,
  },
  [PYTH]: {
    ticker: "PYTH",
    decimals: 6,
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
  [BONK]: {
    ticker: "BONK",
    decimals: 5,
  },
  [WIF]: {
    ticker: "WIF",
    decimals: 6,
  },
  [POPCAT]: {
    ticker: "POPCAT",
    decimals: 9,
  },
  [RETARDIO]: {
    ticker: "RETARDIO",
    decimals: 6,
  },
  [BILLY]: {
    ticker: "BILLY",
    decimals: 6,
  },
};
