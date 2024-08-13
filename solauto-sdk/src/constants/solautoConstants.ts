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
import { SOLAUTO_PROGRAM_ID } from "../generated";
import { SOLAUTO_MANAGER } from "./generalAccounts";

export const DEFAULT_RISK_AVERSION_BPS = 1500;
export const DEFAULT_LIMIT_GAP_BPS = 1000;
export const MIN_POSITION_STATE_FRESHNESS_SECS = 5;
export const MAX_REPAY_GAP_BPS = 100;

// export const JITO_BLOCK_ENGINE = "ny.mainnet.block-engine.jito.wtf";
// export const JITO_CONNECTION = new JitoRpcConnection(
//   `https://${JITO_BLOCK_ENGINE}`,
//   "finalized"
// );

export const PRICES: { [key: string]: { price: number; time: number; } } = {};

export const SOLAUTO_LUT = "9D4xwZwDf46n9ft5gQxZzq3rBbdRXsXojKQLZbBdskPY";

export const JUPITER_PROGRAM_ID = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

export const STANDARD_LUT_ACCOUNTS = [
  PublicKey.default.toString(),
  SOLAUTO_PROGRAM_ID,
  SOLAUTO_MANAGER.toString(),
  SystemProgram.programId.toString(),
  TOKEN_PROGRAM_ID.toString(),
  ASSOCIATED_TOKEN_PROGRAM_ID.toString(),
  SYSVAR_CLOCK_PUBKEY.toString(),
  SYSVAR_RENT_PUBKEY.toString(),
  SYSVAR_INSTRUCTIONS_PUBKEY.toString(),
  JUPITER_PROGRAM_ID
];