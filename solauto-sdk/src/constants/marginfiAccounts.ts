import { NATIVE_MINT } from "@solana/spl-token";
import { USDC_MINT } from "./tokenConstants";
import { MarginfiAssetAccounts } from "../types/accounts";

export const DEFAULT_MARGINFI_GROUP = "4qp6Fx6tnZkY5Wropq9wUYgtFxXKwE6viZxFHg3rdAG8";

export const MARGINFI_ACCOUNTS: { [key: string]: MarginfiAssetAccounts } = {
  SOL: {
    mint: NATIVE_MINT.toString(),
    bank: "CCKtUs6Cgwo4aaQUmBPmyoApH2gUDErxNZCAntD6LYGh",
    liquidityVault: "2eicbpitfJXDwqCuFAmPgDP7t2oUotnAzbGzRKLMgSLe",
    vaultAuthority: "DD3AeAssFvjqTvRTrRAtpfjkBF8FpVKnFuwnMLN9haXD",
    priceOracle: "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"
  },
  USDC: {
    mint: USDC_MINT,
    bank: "2s37akK2eyBbp8DZgCm7RtsaEz8eJP3Nxd4urLHQv7yB",
    liquidityVault: "7jaiZR5Sk8hdYN9MxTpczTcwbWpb5WEoxSANuUwveuat",
    vaultAuthority: "3uxNepDbmkDNq6JhRja5Z8QwbTrfmkKP8AKZV5chYDGG",
    priceOracle: "Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX"
  }
};

export const MARGINFI_ACCOUNTS_LOOKUP_TABLE = "GAjmWmBPcH5Gxbiykasydj6RsCEaCLyHEvK6kHdFigc6";