import { describe, it } from "mocha";
import { PublicKey } from "@solana/web3.js";
import {
  LOCAL_IRONFORGE_API_URL,
  MARGINFI_ACCOUNTS,
  MARGINFI_ACCOUNTS_LOOKUP_TABLE,
  SOLAUTO_MANAGER,
} from "../../src/constants";
import {
  getEmptyMarginfiAccountsByAuthority,
  getSolanaRpcConnection,
} from "../../src/utils";

const [conn, umi] = getSolanaRpcConnection(
  LOCAL_IRONFORGE_API_URL
);

describe("Assert lookup tables up-to-date", async () => {
  it("marginfi accounts LUT should have everything", async () => {
    const lookupTable = await conn.getAddressLookupTable(
      new PublicKey(MARGINFI_ACCOUNTS_LOOKUP_TABLE)
    );
    if (lookupTable === null) {
      throw new Error("Lookup table not found");
    }

    const ismAccounts = await getEmptyMarginfiAccountsByAuthority(
      umi,
      SOLAUTO_MANAGER
    );

    const existingAccounts =
      lookupTable.value?.state.addresses.map((x) => x.toString()) ?? [];

    for (const group in MARGINFI_ACCOUNTS) {
      for (const key in MARGINFI_ACCOUNTS[group]) {
        if (key === PublicKey.default.toString()) {
          continue;
        }

        const groupIsmAccounts = ismAccounts
          .filter((x) => x.group.toString() === group)
          .map((x) => x.publicKey.toString());
        if (groupIsmAccounts.length === 0) {
          throw new Error(`Missing ISM account for group: ${group}`);
        }

        const accounts = MARGINFI_ACCOUNTS[group][key];
        const addresses = [
          group,
          accounts.bank,
          accounts.liquidityVault,
          accounts.vaultAuthority,
          accounts.priceOracle,
          ...groupIsmAccounts,
        ];

        if (addresses.find((x) => !existingAccounts.includes(x.toString()))) {
          throw new Error("Marginfi accounts lookup table missing an account");
        }
      }
    }
  });
});
