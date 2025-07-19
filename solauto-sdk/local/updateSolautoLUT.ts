import { PublicKey } from "@solana/web3.js";
import {
  SOLAUTO_FEES_WALLET,
  SOLAUTO_MANAGER,
  SOLAUTO_LUT,
  STANDARD_LUT_ACCOUNTS,
  SWITCHBOARD_PRICE_FEED_IDS,
  ALL_SUPPORTED_TOKENS,
  getTokenAccounts,
  PYTH_ORACLE_ACCOUNTS,
} from "../src";
import { updateLookupTable } from "./shared";

const LOOKUP_TABLE_ADDRESS = Boolean(SOLAUTO_LUT)
  ? new PublicKey(SOLAUTO_LUT)
  : undefined;
const solautoManagerTokenAccounts = getTokenAccounts(
  SOLAUTO_MANAGER,
  ALL_SUPPORTED_TOKENS.map((x) => new PublicKey(x))
);
const solautoFeeWalletTokenAccounts = getTokenAccounts(
  SOLAUTO_FEES_WALLET,
  ALL_SUPPORTED_TOKENS.map((x) => new PublicKey(x))
);

export async function updateSolautoLut(additionalAccounts?: string[]) {
  return updateLookupTable(
    [
      ...STANDARD_LUT_ACCOUNTS,
      ...ALL_SUPPORTED_TOKENS,
      ...solautoManagerTokenAccounts.map((x) => x.toString()),
      ...solautoFeeWalletTokenAccounts.map((x) => x.toString()),
      ...Object.values(SWITCHBOARD_PRICE_FEED_IDS).map((x) => x.feedId),
      ...Object.values(PYTH_ORACLE_ACCOUNTS),
      ...(additionalAccounts ?? []),
    ],
    LOOKUP_TABLE_ADDRESS
  );
}

updateSolautoLut();
