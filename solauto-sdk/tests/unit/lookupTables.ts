import { describe, it } from "mocha";
import {
  getMarginfiAccounts,
  LOCAL_IRONFORGE_API_URL,
  SOLAUTO_MANAGER,
  getAllBankRelatedAccounts,
  getEmptyMarginfiAccountsByAuthority,
  getSolanaRpcConnection,
  ProgramEnv,
} from "../../src";

const [conn, umi] = getSolanaRpcConnection(LOCAL_IRONFORGE_API_URL);

async function checkLookupTableAccounts(programEnv: ProgramEnv) {
  const data = getMarginfiAccounts(programEnv);
  const lookupTable = await conn.getAddressLookupTable(data.lookupTable);
  if (lookupTable === null) {
    throw new Error("Lookup table not found");
  }

  const ismAccounts = (
    await getEmptyMarginfiAccountsByAuthority(umi, SOLAUTO_MANAGER)
  ).map((x) => x.publicKey.toString());

  const bankAccounts = (
    await getAllBankRelatedAccounts(umi, data.bankAccounts)
  ).map((x) => x.toString());

  const accountsRequired = [...ismAccounts, ...bankAccounts];

  const existingAccounts =
    lookupTable.value?.state.addresses.map((x) => x.toString()) ?? [];

  if (accountsRequired.find((x) => !existingAccounts.includes(x.toString()))) {
    throw new Error("Marginfi accounts lookup table missing an account");
  }
}

describe("Assert lookup tables up-to-date", async () => {
  it("marginfi accounts LUT should have everything", async () => {
    await checkLookupTableAccounts("Prod");
  });
});
