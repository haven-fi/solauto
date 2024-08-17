import { NATIVE_MINT } from "@solana/spl-token";

// When adding token ensure a price feed is provided in pythConstants.ts & the token is added to the necessary lists below
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";


export const ALL_SUPPORTED_TOKENS = [
    NATIVE_MINT.toString(),
    USDC_MINT,
];

export const TOKEN_DECIMALS = {
    [NATIVE_MINT.toString()]: 9,
    [USDC_MINT]: 6
};

export const STABLECOINS = [
    USDC_MINT
];