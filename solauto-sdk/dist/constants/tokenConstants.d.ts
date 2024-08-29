export declare const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export declare const B_SOL = "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1";
export declare const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
export declare const ALL_SUPPORTED_TOKENS: string[];
interface TokenInfo {
    ticker: string;
    decimals: number;
    isStableCoin?: boolean;
    isLST?: boolean;
}
export declare const TOKEN_INFO: {
    [key: string]: TokenInfo;
};
export {};
//# sourceMappingURL=tokenConstants.d.ts.map