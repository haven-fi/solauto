import { MarginfiTokenAccounts } from "../types";
import { USDC_MINT, WSOL_MINT } from "./tokenConstants";

export const MARGINFI_PROGRAM = "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA";
export const MARGINFI_GROUP = "4qp6Fx6tnZkY5Wropq9wUYgtFxXKwE6viZxFHg3rdAG8";

export const MARGINFI_ACCOUNTS: { [key: string]: MarginfiTokenAccounts } = {
  SOL: {
    mint: WSOL_MINT,
    bank: "CCKtUs6Cgwo4aaQUmBPmyoApH2gUDErxNZCAntD6LYGh",
    liquidityVault: "2eicbpitfJXDwqCuFAmPgDP7t2oUotnAzbGzRKLMgSLe",
    vaultAuthority: "DD3AeAssFvjqTvRTrRAtpfjkBF8FpVKnFuwnMLN9haXD",
    priceOracle: "H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG"
  },
  USDC: {
    mint: USDC_MINT,
    bank: "2s37akK2eyBbp8DZgCm7RtsaEz8eJP3Nxd4urLHQv7yB",
    liquidityVault: "7jaiZR5Sk8hdYN9MxTpczTcwbWpb5WEoxSANuUwveuat",
    vaultAuthority: "3uxNepDbmkDNq6JhRja5Z8QwbTrfmkKP8AKZV5chYDGG",
    priceOracle: "Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD"
  }
};

export function findMarginfiAccountsByMint(mint: string): MarginfiTokenAccounts | undefined {
  for (const key in MARGINFI_ACCOUNTS) {
    const account = MARGINFI_ACCOUNTS[key];
    if (account.mint === mint) {
      return account;
    }
  }
  return undefined;
}
