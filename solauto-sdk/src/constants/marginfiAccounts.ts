import { NATIVE_MINT } from "@solana/spl-token";
import * as tokens from "./tokenConstants";
import { MarginfiAssetAccounts } from "../types/accounts";
import { PublicKey } from "@solana/web3.js";

export const DEFAULT_MARGINFI_GROUP =
  "4qp6Fx6tnZkY5Wropq9wUYgtFxXKwE6viZxFHg3rdAG8";

export const DEFAULT_PUBKEY = PublicKey.default.toString();

export const MARGINFI_ACCOUNTS: {
  [group: string]: { [token: string]: MarginfiAssetAccounts };
} = {
  [DEFAULT_MARGINFI_GROUP.toString()]: {
    [NATIVE_MINT.toString()]: {
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
    [tokens.M_SOL]: {
      bank: "22DcjMZrMwC5Bpa5AGBsmjc5V9VuQrXG6N9ZtdUNyYGE",
      liquidityVault: "B6HqNn83a2bLqo4i5ygjLHJgD11ePtQksUyx4MjD55DV",
      vaultAuthority: "6YxGd65JbXzgFGWjE44jsyVeCnZp7Bb1wfL9jDia1n8w",
      priceOracle: "5CKzb9j4ChgLUt8Gfm5CNGLN6khXKiqMbnGAW4cgXgxK",
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

export const MARGINFI_ACCOUNTS_LOOKUP_TABLE =
  "GAjmWmBPcH5Gxbiykasydj6RsCEaCLyHEvK6kHdFigc6";
