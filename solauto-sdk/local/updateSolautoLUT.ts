import { PublicKey } from "@solana/web3.js";
import { getTokenAccounts } from "../src/utils/accountUtils";
import {
  SOLAUTO_FEES_WALLET,
  SOLAUTO_MANAGER,
} from "../src/constants/generalAccounts";
import { ALL_SUPPORTED_TOKENS } from "../src/constants/tokenConstants";
import { updateLookupTable } from "./shared";
import {
  SOLAUTO_LUT,
  STANDARD_LUT_ACCOUNTS,
} from "../src/constants/solautoConstants";
import {
  buildHeliusApiUrl,
  getAllMarginfiAccountsByAuthority,
  getSolanaRpcConnection,
} from "../src/utils";

const LOOKUP_TABLE_ADDRESS = new PublicKey(SOLAUTO_LUT);
const solautoManagerTokenAccounts = getTokenAccounts(
  SOLAUTO_MANAGER,
  ALL_SUPPORTED_TOKENS.map((x) => new PublicKey(x))
);
const solautoFeeWalletTokenAccounts = getTokenAccounts(
  SOLAUTO_FEES_WALLET,
  ALL_SUPPORTED_TOKENS.map((x) => new PublicKey(x))
);

export async function updateSolautoLut(additionalAccounts?: string[]) {
  const [connection, umi] = getSolanaRpcConnection(
    buildHeliusApiUrl(process.env.HELIUS_API_KEY!)
  );
  const solautoManagerMarginfiAccounts =
    await getAllMarginfiAccountsByAuthority(
      connection,
      umi,
      SOLAUTO_MANAGER,
      false
    );

  return updateLookupTable(
    [
      ...STANDARD_LUT_ACCOUNTS,
      ...solautoManagerTokenAccounts.map((x) => x.toString()),
      ...solautoFeeWalletTokenAccounts.map((x) => x.toString()),
      ...(additionalAccounts ?? []),
      ...solautoManagerMarginfiAccounts.map((x) =>
        x.marginfiAccount.toString()
      ),
    ],
    LOOKUP_TABLE_ADDRESS
  );
}

updateSolautoLut();
