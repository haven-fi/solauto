import { PublicKey } from "@solana/web3.js";
import { getTokenAccounts } from "../src/utils/accountUtils";
import { SOLAUTO_MANAGER } from "../src/constants/generalAccounts";
import { ALL_SUPPORTED_TOKENS } from "../src/constants/tokenConstants";
import { updateLookupTable } from "./shared";
import { SOLAUTO_LUT, STANDARD_LUT_ACCOUNTS } from "../src/constants/solautoConstants";

const LOOKUP_TABLE_ADDRESS = new PublicKey(SOLAUTO_LUT);
const solautoManagerTokenAccounts = getTokenAccounts(SOLAUTO_MANAGER, ALL_SUPPORTED_TOKENS.map((x) => new PublicKey(x)));

export async function updateSolautoLut(additionalAccounts?: string[]) {
  return updateLookupTable(
    [
      ...STANDARD_LUT_ACCOUNTS,
      ...solautoManagerTokenAccounts.map((x) => x.toString()),
      ...(additionalAccounts ?? [])
    ],
    LOOKUP_TABLE_ADDRESS
  );
}

updateSolautoLut();