import {
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  PublicKey,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { SOLAUTO_MANAGER } from "./generalAccounts";
import { JUPITER_PROGRAM_ID } from "../jupiter-sdk";
import { HNT, JLP, JTO, JUP, PYTH, WETH } from "./tokenConstants";

export const SOLAUTO_PROD_PROGRAM = new PublicKey(
  "AutoyKBRaHSBHy9RsmXCZMy6nNFAg5FYijrvZyQcNLV"
);
export const SOLAUTO_TEST_PROGRAM = new PublicKey(
  "TesTjfQ6TbXv96Tv6fqr95XTZ1LYPxtkafmShN9PjBp"
);

(globalThis as any).LOCAL_TEST = false;

export const BASIS_POINTS = 10000;

export const MIN_POSITION_STATE_FRESHNESS_SECS = 5;
export const MIN_REPAY_GAP_BPS = 50;
export const MIN_BOOST_GAP_BPS = 50;
export const MIN_USD_SUPPORTED_POSITION = 1000;

export const PRICES: { [key: string]: { price: number; time: number } } = {};

export const JITO_BLOCK_ENGINE = "https://mainnet.block-engine.jito.wtf";

export const JITO_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
];

export const SOLAUTO_LUT = "9D4xwZwDf46n9ft5gQxZzq3rBbdRXsXojKQLZbBdskPY";
export const STANDARD_LUT_ACCOUNTS = [
  PublicKey.default,
  SOLAUTO_PROD_PROGRAM,
  SOLAUTO_TEST_PROGRAM,
  SOLAUTO_MANAGER,
  SystemProgram.programId,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  JUPITER_PROGRAM_ID,
  ...JITO_TIP_ACCOUNTS
].map((x) => x.toString());

// TODO:
export const BROKEN_TOKENS = [
  JUP,
  JLP,
  WETH,
  HNT,
  JTO,
  PYTH
]