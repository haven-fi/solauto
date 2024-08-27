"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MARGINFI_ACCOUNTS_LOOKUP_TABLE = exports.MARGINFI_ACCOUNTS = exports.DEFAULT_MARGINFI_GROUP = void 0;
const spl_token_1 = require("@solana/spl-token");
const tokenConstants_1 = require("./tokenConstants");
exports.DEFAULT_MARGINFI_GROUP = "4qp6Fx6tnZkY5Wropq9wUYgtFxXKwE6viZxFHg3rdAG8";
exports.MARGINFI_ACCOUNTS = {
    [spl_token_1.NATIVE_MINT.toString()]: {
        bank: "CCKtUs6Cgwo4aaQUmBPmyoApH2gUDErxNZCAntD6LYGh",
        liquidityVault: "2eicbpitfJXDwqCuFAmPgDP7t2oUotnAzbGzRKLMgSLe",
        vaultAuthority: "DD3AeAssFvjqTvRTrRAtpfjkBF8FpVKnFuwnMLN9haXD",
        priceOracle: "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"
    },
    [tokenConstants_1.USDC_MINT]: {
        bank: "2s37akK2eyBbp8DZgCm7RtsaEz8eJP3Nxd4urLHQv7yB",
        liquidityVault: "7jaiZR5Sk8hdYN9MxTpczTcwbWpb5WEoxSANuUwveuat",
        vaultAuthority: "3uxNepDbmkDNq6JhRja5Z8QwbTrfmkKP8AKZV5chYDGG",
        priceOracle: "Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX"
    },
    [tokenConstants_1.B_SOL]: {
        bank: "6hS9i46WyTq1KXcoa2Chas2Txh9TJAVr6n1t3tnrE23K",
        liquidityVault: "2WMipeKDB2CENxbzdmnVrRbsxCA2LY6kCtBe6AAqDP9p",
        vaultAuthority: "8RcZHucpVHkHWRRdMhJZsxBK9mqKSYnMKGqtF84U8YEo",
        priceOracle: "5cN76Xm2Dtx9MnrQqBDeZZRsWruTTcw37UruznAdSvvE",
    },
    [tokenConstants_1.JUP]: {
        bank: "Guu5uBc8k1WK1U2ihGosNaCy57LSgCkpWAabtzQqrQf8",
        liquidityVault: "4w49W4fNDn778wsBa6TNq9hvebZKU17ymsptrEZ8zrsm",
        vaultAuthority: "2MBwwAhL3c73Jy7HkWd9ofzh1bU39JBabrZCFQR2tUof",
        priceOracle: "7dbob1psH1iZBS7qPsm3Kwbf5DzSXK8Jyg31CTgTnxH5",
    }
};
exports.MARGINFI_ACCOUNTS_LOOKUP_TABLE = "GAjmWmBPcH5Gxbiykasydj6RsCEaCLyHEvK6kHdFigc6";
