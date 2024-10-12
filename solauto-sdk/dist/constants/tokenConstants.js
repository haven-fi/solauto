"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOKEN_INFO = exports.ALL_SUPPORTED_TOKENS = exports.USDT = exports.USDC = exports.PYTH = exports.HNT = exports.WETH = exports.WBTC = exports.JLP = exports.JTO = exports.WIF = exports.BONK = exports.JUP = exports.INF = exports.M_SOL = exports.LST = exports.JITO_SOL = exports.B_SOL = void 0;
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
// When adding token ensure a price feed is provided in pythConstants.ts & the token is in TOKEN_INFO
exports.B_SOL = "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1";
exports.JITO_SOL = "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn";
exports.LST = "LSTxxxnJzKDFSLr4dUkPcmCf5VyryEqzPLz5j4bpxFp";
exports.M_SOL = "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So";
exports.INF = "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm";
exports.JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
exports.BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
exports.WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
exports.JTO = "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL";
exports.JLP = "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4";
exports.WBTC = "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh";
exports.WETH = "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs";
exports.HNT = "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux";
exports.PYTH = "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3";
exports.USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
exports.USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
exports.ALL_SUPPORTED_TOKENS = [
    spl_token_1.NATIVE_MINT.toString(),
    exports.B_SOL,
    exports.JITO_SOL,
    exports.LST,
    exports.M_SOL,
    exports.INF,
    exports.JUP,
    exports.BONK,
    exports.WIF,
    exports.JTO,
    exports.JLP,
    exports.WBTC,
    exports.WETH,
    exports.HNT,
    exports.PYTH,
    exports.USDC,
    exports.USDT,
];
exports.TOKEN_INFO = {
    [web3_js_1.PublicKey.default.toString()]: {
        ticker: "",
        decimals: 1,
    },
    [spl_token_1.NATIVE_MINT.toString()]: {
        ticker: "SOL",
        decimals: 9,
    },
    [exports.B_SOL]: {
        ticker: "bSOL",
        decimals: 9,
        isLST: true,
    },
    [exports.JITO_SOL]: {
        ticker: "JitoSOL",
        decimals: 9,
        isLST: true,
    },
    [exports.LST]: {
        ticker: "LST",
        decimals: 9,
        isLST: true,
    },
    [exports.M_SOL]: {
        ticker: "mSOL",
        decimals: 9,
        isLST: true,
    },
    [exports.INF]: {
        ticker: "INF",
        decimals: 9,
        isLST: true,
    },
    [exports.JUP]: {
        ticker: "JUP",
        decimals: 6,
    },
    [exports.BONK]: {
        ticker: "BONK",
        decimals: 5,
    },
    [exports.WIF]: {
        ticker: "WIF",
        decimals: 6
    },
    [exports.JTO]: {
        ticker: "JTO",
        decimals: 9,
    },
    [exports.JLP]: {
        ticker: "JLP",
        decimals: 6,
    },
    [exports.WBTC]: {
        ticker: "WBTC",
        decimals: 8,
    },
    [exports.WETH]: {
        ticker: "WETH",
        decimals: 8
    },
    [exports.HNT]: {
        ticker: "HNT",
        decimals: 8
    },
    [exports.PYTH]: {
        ticker: "PYTH",
        decimals: 6
    },
    [exports.USDC]: {
        ticker: "USDC",
        decimals: 6,
        isStableCoin: true,
    },
    [exports.USDT]: {
        ticker: "USDT",
        decimals: 6,
        isStableCoin: true,
    },
};
