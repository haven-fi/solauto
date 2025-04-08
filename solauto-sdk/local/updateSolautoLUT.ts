import { PublicKey } from "@solana/web3.js";
import {
  SOLAUTO_FEES_WALLET,
  SOLAUTO_MANAGER,
  SOLAUTO_LUT,
  STANDARD_LUT_ACCOUNTS,
  SWITCHBOARD_PRICE_FEED_IDS,
  ALL_SUPPORTED_TOKENS,
  getAllMarginfiAccountsByAuthority,
  getSolanaRpcConnection,
  getTokenAccounts,
  LOCAL_IRONFORGE_API_URL,
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
  const [_, umi] = getSolanaRpcConnection(
    LOCAL_IRONFORGE_API_URL
  );
  const ismAccounts = await getAllMarginfiAccountsByAuthority(
    umi,
    SOLAUTO_MANAGER
  );

  return updateLookupTable(
    [
      ...STANDARD_LUT_ACCOUNTS,
      ...ALL_SUPPORTED_TOKENS,
      ...solautoManagerTokenAccounts.map((x) => x.toString()),
      ...solautoFeeWalletTokenAccounts.map((x) => x.toString()),
      ...ismAccounts.map((x) => x.marginfiAccount.toString()),
      ...Object.values(SWITCHBOARD_PRICE_FEED_IDS).map((x) => x.feedId),
      ...(additionalAccounts ?? []),
    ],
    LOOKUP_TABLE_ADDRESS
  );
}

updateSolautoLut();
