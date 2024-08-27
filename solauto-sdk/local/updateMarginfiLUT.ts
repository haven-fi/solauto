import { PublicKey } from "@solana/web3.js";
import { MARGINFI_ACCOUNTS_LOOKUP_TABLE } from "../src/constants/marginfiAccounts";
import {
  MARGINFI_ACCOUNTS,
  DEFAULT_MARGINFI_GROUP,
} from "../src/constants/marginfiAccounts";
import { MARGINFI_PROGRAM_ID } from "../src/marginfi-sdk";
import { updateLookupTable } from "./shared";

const LOOKUP_TABLE_ADDRESS = new PublicKey(MARGINFI_ACCOUNTS_LOOKUP_TABLE);

async function addBanks() {
  for (const key in MARGINFI_ACCOUNTS) {
    const accounts = MARGINFI_ACCOUNTS[key];
    await updateLookupTable(
      [
        key,
        accounts.bank,
        accounts.liquidityVault,
        accounts.vaultAuthority,
        accounts.priceOracle,
      ],
      LOOKUP_TABLE_ADDRESS
    );
  }
}

updateLookupTable(
  [DEFAULT_MARGINFI_GROUP, MARGINFI_PROGRAM_ID],
  LOOKUP_TABLE_ADDRESS
);

addBanks();
