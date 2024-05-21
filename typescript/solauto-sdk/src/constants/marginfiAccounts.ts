import { MarginfiTokenAccounts } from "../types";

export const MARGINFI_PROGRAM = "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA";

export const MARGINFI_ACCOUNTS: { [key: string]: MarginfiTokenAccounts } = {
  SOL: {
    mint: "So11111111111111111111111111111111111111112",
    bank: "CCKtUs6Cgwo4aaQUmBPmyoApH2gUDErxNZCAntD6LYGh",
    liquidityVault: "2eicbpitfJXDwqCuFAmPgDP7t2oUotnAzbGzRKLMgSLe",
    vaultAuthority: "DD3AeAssFvjqTvRTrRAtpfjkBF8FpVKnFuwnMLN9haXD",
    priceOracle: "H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG"
  },
  USDC: {
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    bank: "2s37akK2eyBbp8DZgCm7RtsaEz8eJP3Nxd4urLHQv7yB",
    liquidityVault: "7jaiZR5Sk8hdYN9MxTpczTcwbWpb5WEoxSANuUwveuat",
    vaultAuthority: "3uxNepDbmkDNq6JhRja5Z8QwbTrfmkKP8AKZV5chYDGG",
    priceOracle: "Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD"
  }
};