import { NATIVE_MINT } from "@solana/spl-token";
import { B_SOL, JUP, USDC_MINT } from "./tokenConstants";

// https://pyth.network/developers/price-feed-ids#solana-stable
export const PYTH_PRICE_FEED_IDS = {
  [NATIVE_MINT.toString()]:
    "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  [USDC_MINT]:
    "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
  [B_SOL]: "0x89875379e70f8fbadc17aef315adf3a8d5d160b811435537e03c97e8aac97d9c",
  [JUP]: "0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996",
};
