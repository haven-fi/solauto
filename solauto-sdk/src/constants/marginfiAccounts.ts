import { NATIVE_MINT } from "@solana/spl-token";
import * as tokens from "./tokenConstants";
import { MarginfiAssetAccounts } from "../types/accounts";
import { PublicKey } from "@solana/web3.js";
import { SWITCHBOARD_PRICE_FEED_IDS } from "./switchboardConstants";

export const DEFAULT_MARGINFI_GROUP =
  "4qp6Fx6tnZkY5Wropq9wUYgtFxXKwE6viZxFHg3rdAG8";

export const DEFAULT_PUBKEY = PublicKey.default.toString();

const USDC_PRICE_ORACLE = "Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX";

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
      priceOracle: "Ceg5oePJv1a6RR541qKeQaTepvERA3i8SvyueX9tT8Sq",
    },
    [tokens.H_SOL]: {
      bank: "GJCi1uj3kYPZ64puA5sLUiCQfFapxT2xnREzrbDzFkYY",
      liquidityVault: "8M97jkdr4rJtPnQ4yQ9stD6qVwaUvjrBdDPDbHJnPJLf",
      vaultAuthority: "8x7mgTn5RvHR8Tn3CJqexSuQwrs6MLEy8csuXCDVvvpt",
      priceOracle: SWITCHBOARD_PRICE_FEED_IDS[tokens.H_SOL.toString()],
    },
    [tokens.JUP_SOL]: {
      bank: "8LaUZadNqtzuCG7iCvZd7d5cbquuYfv19KjAg6GPuuCb",
      liquidityVault: "B1zjqKPoYp9bTMhzFADaAvjyGb49FMitLpi6P3Pa3YR6",
      vaultAuthority: "93Qqsge2jHVsWLd8vas4cWghrsZJooMUr5JKN5DtcfMX",
      priceOracle: SWITCHBOARD_PRICE_FEED_IDS[tokens.JUP_SOL.toString()],
    },
    [tokens.JUP]: {
      bank: "Guu5uBc8k1WK1U2ihGosNaCy57LSgCkpWAabtzQqrQf8",
      liquidityVault: "4w49W4fNDn778wsBa6TNq9hvebZKU17ymsptrEZ8zrsm",
      vaultAuthority: "2MBwwAhL3c73Jy7HkWd9ofzh1bU39JBabrZCFQR2tUof",
      priceOracle: "7dbob1psH1iZBS7qPsm3Kwbf5DzSXK8Jyg31CTgTnxH5",
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
      priceOracle: USDC_PRICE_ORACLE,
    },
    [tokens.USDT]: {
      bank: "HmpMfL8942u22htC4EMiWgLX931g3sacXFR6KjuLgKLV",
      liquidityVault: "77t6Fi9qj4s4z22K1toufHtstM8rEy7Y3ytxik7mcsTy",
      vaultAuthority: "9r6z6KgkEytHCdQWNxvDQH98PsfU98f1m5PCg47mY2XE",
      priceOracle: "HT2PLQBcG5EiCcNSaMHAjSgd9F98ecpATbk4Sk5oYuM",
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
  },
  ["DQ2jqDJw9uzTwttf6h6r217BQ7kws3jZbJXDkfbCJa1q"]: {
    [tokens.POPCAT]: {
      bank: "845oEvt1oduoBj5zQxTr21cWWaUVnRjGerJuW3yMo2nn",
      liquidityVault: "At6R64ip51zay4dT6k1WnVGETSMcaiY5vggD5DVTgxri",
      vaultAuthority: "dNraDCWb5usDSoW4kD1Mi2E9WsNu6EABcQZqnrDfjNb",
      priceOracle: SWITCHBOARD_PRICE_FEED_IDS[tokens.POPCAT.toString()],
    },
    [tokens.USDC]: {
      bank: "EXrnNVfLagt3j4hCHSD9WqK75o6dkZBtjpnrSrSC78MA",
      liquidityVault: "D9HSUYz3Rg2cTH65dUPaQS1MYxofNTeLecsAjiBgVPur",
      vaultAuthority: "5ivKgJnxQ9CewJcKYSPQUiQFdfJki6YS87FqohnMSsFM",
      priceOracle: USDC_PRICE_ORACLE,
    },
  },
  ["EpzY5EYF1A5eFDRfjtsPXSYMPmEx1FXKaXPnouTMF4dm"]: {
    [tokens.RETARDIO]: {
      bank: "3J5rKmCi7JXG6qmiobFJyAidVTnnNAMGj4jomfBxKGRM",
      liquidityVault: "863K9YPVT3xbUGFZevrQJLqMux3UdRkwNQ6usAp4hJyy",
      vaultAuthority: "Qsv2rnNRdv59AwRU3YmGPMCTdKT41CDAKyYAr4srCJR",
      priceOracle: SWITCHBOARD_PRICE_FEED_IDS[tokens.RETARDIO.toString()],
    },
    [tokens.USDC]: {
      bank: "6cgYhBFWCc5sNHxkvSRhd5H9AdAHR41zKwuF37HmLry5",
      liquidityVault: "7orVfNL5ZjqvdSaDgYLgBk4i5B3AnwFXNqqAvJbx6DFy",
      vaultAuthority: "G4Azxk4PYtNRmDZkJppYo3rNAinkZXzYpQPG5dVDh4Nj",
      priceOracle: USDC_PRICE_ORACLE,
    },
  },
  ["G1rt3EpQ43K3bY457rhukQGRAo2QxydFAGRKqnjKzyr5"]: {
    [tokens.BILLY]: {
      bank: "Dj3PndQ3j1vuga5ApiFWWAfQ4h3wBtgS2SeLZBT2LD4g",
      liquidityVault: "BRcRMDVPBQzXNXWtSS6bNotcGxhVsxfiAt1qf8nFVUpx",
      vaultAuthority: "36SgFh1qBRyj1PEhsn7Kg9Sfwbrn7rHP7kvTM5o5n6AL",
      priceOracle: SWITCHBOARD_PRICE_FEED_IDS[tokens.BILLY.toString()],
    },
    [tokens.USDC]: {
      bank: "A7vBgCowCYeja7GTc3pyqUBdC9Gkue2gWaMjGZW38meM",
      liquidityVault: "DBGhZ8TJTG2Pacdva27zY9etaro24o1tTA3LToSjYHbx",
      vaultAuthority: "Cg6BCqkGny7A2AXCV8rikhHXM82wqqfzmdsTobEeTQkH",
      priceOracle: USDC_PRICE_ORACLE,
    },
  },
  ["DESG67cExEcw7d6MmENLEzaocR8pLrhfiw9VrNtGWUKD"]: {
    [tokens.HMTR]: {
      bank: "Br3yzg2WSb81RaFWK9UsKtq8fD5viwooZG34mKqQWxdM",
      liquidityVault: "J45Je52qv2rDBuCQWPwp3bjRhf3bGzRWhKZtGDuLooCX",
      vaultAuthority: "CKDsAKjNruDSz4tmUairh8PDGD1Rqh9WMTLWERYnnZrH",
      priceOracle: SWITCHBOARD_PRICE_FEED_IDS[tokens.HMTR.toString()],
    },
    [tokens.USDC]: {
      bank: "9yNnhJ8c1vGbu3DMf6eeeUi6TDJ2ddGgaRA88rL2R3rP",
      liquidityVault: "4U1UBjXrPrW7JuQ894JbLUBqcb5LFfK9rfkWFwT7EdQ9",
      vaultAuthority: "CY74V1r48kuuHA6APD3AaU2oPV1mBqe9srikrQQSHNR6",
      priceOracle: USDC_PRICE_ORACLE,
    }
  }
};

export const MARGINFI_ACCOUNTS_LOOKUP_TABLE =
  "GAjmWmBPcH5Gxbiykasydj6RsCEaCLyHEvK6kHdFigc6";
