"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MARGINFI_ACCOUNTS_LOOKUP_TABLE = exports.MARGINFI_ACCOUNTS = exports.DEFAULT_PUBKEY = exports.DEFAULT_MARGINFI_GROUP = void 0;
const spl_token_1 = require("@solana/spl-token");
const tokens = __importStar(require("./tokenConstants"));
const web3_js_1 = require("@solana/web3.js");
exports.DEFAULT_MARGINFI_GROUP = "4qp6Fx6tnZkY5Wropq9wUYgtFxXKwE6viZxFHg3rdAG8";
exports.DEFAULT_PUBKEY = web3_js_1.PublicKey.default.toString();
exports.MARGINFI_ACCOUNTS = {
    [exports.DEFAULT_MARGINFI_GROUP.toString()]: {
        [spl_token_1.NATIVE_MINT.toString()]: {
            bank: "CCKtUs6Cgwo4aaQUmBPmyoApH2gUDErxNZCAntD6LYGh",
            liquidityVault: "2eicbpitfJXDwqCuFAmPgDP7t2oUotnAzbGzRKLMgSLe",
            vaultAuthority: "DD3AeAssFvjqTvRTrRAtpfjkBF8FpVKnFuwnMLN9haXD",
            priceOracle: "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE",
        },
        [tokens.B_SOL]: {
            bank: "6hS9i46WyTq1KXcoa2Chas2Txh9TJAVr6n1t3tnrE23K",
            liquidityVault: "2WMipeKDB2CENxbzdmnVrRbsxCA2LY6kCtBe6AAqDP9p",
            vaultAuthority: "8RcZHucpVHkHWRRdMhJZsxBK9mqKSYnMKGqtF84U8YEo",
            priceOracle: "5cN76Xm2Dtx9MnrQqBDeZZRsWruTTcw37UruznAdSvvE",
        },
        [tokens.M_SOL]: {
            bank: "22DcjMZrMwC5Bpa5AGBsmjc5V9VuQrXG6N9ZtdUNyYGE",
            liquidityVault: "B6HqNn83a2bLqo4i5ygjLHJgD11ePtQksUyx4MjD55DV",
            vaultAuthority: "6YxGd65JbXzgFGWjE44jsyVeCnZp7Bb1wfL9jDia1n8w",
            priceOracle: "5CKzb9j4ChgLUt8Gfm5CNGLN6khXKiqMbnGAW4cgXgxK",
        },
        [tokens.JITO_SOL]: {
            bank: "Bohoc1ikHLD7xKJuzTyiTyCwzaL5N7ggJQu75A8mKYM8",
            liquidityVault: "38VGtXd2pDPq9FMh1z6AVjcHCoHgvWyMhdNyamDTeeks",
            vaultAuthority: "7Ng54qf7BrCcZLqXmKA9WSR7SVRn4q6RX1YpLksBQ21A",
            priceOracle: "AxaxyeDT8JnWERSaTKvFXvPKkEdxnamKSqpWbsSjYg1g",
        },
        [tokens.LST]: {
            bank: "DMoqjmsuoru986HgfjqrKEvPv8YBufvBGADHUonkadC5",
            liquidityVault: "DMQUXpb6K5L8osgV4x3NeEPUoJCf2VBgnA8FQusDjSou",
            vaultAuthority: "6PWVauGLhBFHUJspsnBVZHr56ZnbvmhSD2gS7czBHGpE",
            priceOracle: "7aT9A5knp62jVvnEW33xaWopaPHa3Y7ggULyYiUsDhu8",
        },
        [tokens.INF]: {
            bank: "AwLRW3aPMMftXEjgWhTkYwM9CGBHdtKecvahCJZBwAqY",
            liquidityVault: "HQ1CGcqRshMhuonTGTnnmgw9ffcXxizGdZ6F6PKffWWi",
            vaultAuthority: "AEZb1XH5bfLwqk3hBKDuLfWyJKdLTgDPCkgn64BJKcvV",
            priceOracle: "DCNeMcAZGU7pAsqu5q2xMKerq35BnUuTkagt1dkR1xB",
        },
        [tokens.JUP]: {
            bank: "Guu5uBc8k1WK1U2ihGosNaCy57LSgCkpWAabtzQqrQf8",
            liquidityVault: "4w49W4fNDn778wsBa6TNq9hvebZKU17ymsptrEZ8zrsm",
            vaultAuthority: "2MBwwAhL3c73Jy7HkWd9ofzh1bU39JBabrZCFQR2tUof",
            priceOracle: "7dbob1psH1iZBS7qPsm3Kwbf5DzSXK8Jyg31CTgTnxH5",
        },
        [tokens.BONK]: {
            bank: "DeyH7QxWvnbbaVB4zFrf4hoq7Q8z1ZT14co42BGwGtfM",
            liquidityVault: "7FdQsXmCW3N5JQbknj3F9Yqq73er9VZJjGhEEMS8Ct2A",
            vaultAuthority: "26kcZkdjJc94PdhqiLiEaGiLCYgAVVUfpDaZyK4cqih3",
            priceOracle: "DBE3N8uNjhKPRHfANdwGvCZghWXyLPdqdSbEW2XFwBiX",
        },
        [tokens.WIF]: {
            bank: "9dpu8KL5ABYiD3WP2Cnajzg1XaotcJvZspv29Y1Y3tn1",
            liquidityVault: "4kT3EXc5dDVndUU9mV6EH3Jh3CSEvpcCZjuMkwqrtxUy",
            vaultAuthority: "9gNrvvZ9RuTyRWooiEEypwcXU6kyXW8yWuhXU8tWUH5L",
            priceOracle: "6B23K3tkb51vLZA14jcEQVCA1pfHptzEHFA93V5dYwbT",
        },
        [tokens.JTO]: {
            bank: "EdB7YADw4XUt6wErT8kHGCUok4mnTpWGzPUU9rWDebzb",
            liquidityVault: "3bY1DEkXodGmPMG5f7ABA12228MBG5JdAAKf5cgkB6G1",
            vaultAuthority: "H2b4f2fGSKFortxwzrMZBnYVfr2yrKVUakg4Md9be3Wv",
            priceOracle: "7ajR2zA4MGMMTqRAVjghTKqPPn4kbrj3pYkAVRVwTGzP",
        },
        [tokens.JLP]: {
            bank: "Amtw3n7GZe5SWmyhMhaFhDTi39zbTkLeWErBsmZXwpDa",
            liquidityVault: "9xfyL8gxbV77VvhdgFmacHyLEG4h7d2eDWkSMfhXUPQ",
            vaultAuthority: "F4RSGd4BRXscCqAVG3rFLiPVpo7v6j1drVqnvSM3rBKH",
            priceOracle: "B1wxT1VK3i6DqCeXNdTHT5hBAJkLa3rxuTqBc7E7XRXV",
        },
        [tokens.WBTC]: {
            bank: "BKsfDJCMbYep6gr9pq8PsmJbb5XGLHbAJzUV8vmorz7a",
            liquidityVault: "CMNdnjfaDQZo3VMoX31wZQBnSGu5FMmb1CnBaU4tApZk",
            vaultAuthority: "7P2TQHYgVJkXv1VPaREsL5Pi1gnNjVif5aF3pJewZ9kj",
            priceOracle: "4cSM2e6rvbGQUFiJbqytoVMi5GgghSMr8LwVrT9VPSPo",
        },
        [tokens.WETH]: {
            bank: "BkUyfXjbBBALcfZvw76WAFRvYQ21xxMWWeoPtJrUqG3z",
            liquidityVault: "AxPJtiTEDksJWvCqNHCziK4uUcabqfmwW41dqtZrPFkp",
            vaultAuthority: "ELXogWuyXrFyUG1vevffVbEhVxdFrHf2GCJTtRGKBWdM",
            priceOracle: "42amVS4KgzR9rA28tkVYqVXjq9Qa8dcZQMbH5EYFX6XC",
        },
        [tokens.HNT]: {
            bank: "JBcir4DPRPYVUpks9hkS1jtHMXejfeBo4xJGv3AYYHg6",
            liquidityVault: "E8Q7u5e9L9Uykx16em75ERT9wfbBPtkNL8gsRjoP8GB9",
            vaultAuthority: "AjsyrYpgaH275DBSnvNWdGK33hVycSFuXN87FKnX6fVY",
            priceOracle: "4DdmDswskDxXGpwHrXUfn2CNUm9rt21ac79GHNTN3J33",
        },
        [tokens.PYTH]: {
            bank: "E4td8i8PT2BZkMygzW4MGHCv2KPPs57dvz5W2ZXf9Twu",
            liquidityVault: "DUrAkkaMAckzes7so9T5frXm9YFFgjAAm3MMwHwTfVJq",
            vaultAuthority: "9b5KdVnbbfEQ2qhLeFjWvcAx2VWe9XHx7ZgayZyL9a6C",
            priceOracle: "8vjchtMuJNY4oFQdTi8yCe6mhCaNBFaUbktT482TpLPS",
        },
        [tokens.USDC]: {
            bank: "2s37akK2eyBbp8DZgCm7RtsaEz8eJP3Nxd4urLHQv7yB",
            liquidityVault: "7jaiZR5Sk8hdYN9MxTpczTcwbWpb5WEoxSANuUwveuat",
            vaultAuthority: "3uxNepDbmkDNq6JhRja5Z8QwbTrfmkKP8AKZV5chYDGG",
            priceOracle: "Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX",
        },
        [tokens.USDT]: {
            bank: "HmpMfL8942u22htC4EMiWgLX931g3sacXFR6KjuLgKLV",
            liquidityVault: "77t6Fi9qj4s4z22K1toufHtstM8rEy7Y3ytxik7mcsTy",
            vaultAuthority: "9r6z6KgkEytHCdQWNxvDQH98PsfU98f1m5PCg47mY2XE",
            priceOracle: "HT2PLQBcG5EiCcNSaMHAjSgd9F98ecpATbk4Sk5oYuM",
        },
    },
};
exports.MARGINFI_ACCOUNTS_LOOKUP_TABLE = "GAjmWmBPcH5Gxbiykasydj6RsCEaCLyHEvK6kHdFigc6";
