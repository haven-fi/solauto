import { describe, it } from "mocha";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import {
  DEFAULT_PUBKEY,
  MARGINFI_ACCOUNTS,
  MARGINFI_ACCOUNTS_LOOKUP_TABLE,
} from "../../src/constants/marginfiAccounts";

const conn = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");

describe("Assert lookup tables up-to-date", async () => {
  it("marginfi accounts LUT should have everything", async () => {
    const lookupTable = await conn.getAddressLookupTable(
      new PublicKey(MARGINFI_ACCOUNTS_LOOKUP_TABLE)
    );
    if (lookupTable === null) {
      throw new Error("Lookup table not found");
    }

    const existingAccounts =
      lookupTable.value?.state.addresses.map((x) => x.toString()) ?? [];

    for (const group in MARGINFI_ACCOUNTS) {
      for (const key in MARGINFI_ACCOUNTS[group]) {
        if (key === PublicKey.default.toString()) {
          continue;
        }

        const accounts = MARGINFI_ACCOUNTS[group][key];
        const addresses = [
          new PublicKey(key),
          accounts.bank,
          accounts.liquidityVault,
          accounts.vaultAuthority,
          accounts.priceOracle,
        ];

        if (addresses.find((x) => !existingAccounts.includes(x.toString()))) {
          throw new Error("Marginfi accounts lookup table missing an account");
        }
      }
    }
  });
});
