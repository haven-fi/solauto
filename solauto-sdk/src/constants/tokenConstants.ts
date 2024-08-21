import { NATIVE_MINT } from "@solana/spl-token";

// When adding token ensure a price feed is provided in pythConstants.ts & the token is in TOKEN_INFO
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const B_SOL = "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1";
export const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";


export const ALL_SUPPORTED_TOKENS = [
    NATIVE_MINT.toString(),
    USDC_MINT,
    B_SOL,
    JUP,
];

interface TokenInfo {
    decimals: number;
    isStableCoin?: boolean;
    isLST?: boolean;
}

export const TOKEN_INFO: { [key: string]: TokenInfo } = {
    [NATIVE_MINT.toString()]: {
        decimals: 9,
    },
    [USDC_MINT]: {
        decimals: 6,
        isStableCoin: true
    },
    [B_SOL]: {
        decimals: 9,
        isLST: true
    },
    [JUP]: {
        decimals: 6
    }
};