import { PublicKey } from "@solana/web3.js";

export interface MarginfiTokenAccounts {
  mint: string;
  bank: string;
  liquidityVault: string;
  vaultAuthority: string;
  priceOracle: string;
}
