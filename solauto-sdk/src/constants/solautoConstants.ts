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
// import { JitoRpcConnection } from "jito-ts";
import { SOLAUTO_MANAGER } from "./generalAccounts";
import { JUPITER_PROGRAM_ID } from "../jupiter-sdk";

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
].map((x) => x.toString());

// export const JITO_BLOCK_ENGINE = "ny.mainnet.block-engine.jito.wtf";
// export const JITO_CONNECTION = new JitoRpcConnection(
//   `https://${JITO_BLOCK_ENGINE}`,
//   "finalized"
// );
