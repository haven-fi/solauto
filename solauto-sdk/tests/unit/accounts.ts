import { describe, it } from "mocha";
import {
  ALL_SUPPORTED_TOKENS,
  TOKEN_INFO,
} from "../../src/constants/tokenConstants";
import {
  buildHeliusApiUrl,
  getSolanaRpcConnection,
} from "../../src/utils/solanaUtils";
import { publicKey } from "@metaplex-foundation/umi";
import { assert } from "chai";
import {
  getEmptyMarginfiAccountsByAuthority,
  getTokenAccount,
} from "../../src/utils";
import {
  MARGINFI_ACCOUNTS,
  SOLAUTO_FEES_WALLET,
  SOLAUTO_MANAGER,
} from "../../src/constants";
import { PublicKey } from "@solana/web3.js";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";

async function hasTokenAccounts(wallet: PublicKey) {
  let [_, umi] = getSolanaRpcConnection(
    buildHeliusApiUrl(process.env.HELIUS_API_KEY!)
  );

  const tokenAccounts = await umi.rpc.getAccounts(
    ALL_SUPPORTED_TOKENS.map((x) =>
      publicKey(getTokenAccount(wallet, new PublicKey(x)))
    )
  );
  for (let i = 0; i < tokenAccounts.length; i++) {
    console.log(tokenAccounts[i].publicKey.toString());
    if (!tokenAccounts[i].exists) {
      console.log(
        `Missing ${wallet.toString()} TA for `,
        TOKEN_INFO[ALL_SUPPORTED_TOKENS[i].toString()].ticker
      );
    }
  }
  assert(tokenAccounts.filter((x) => !x.exists).length === 0);
}

describe("Assert Solauto fee token accounts are created", async () => {
  it("all Solauto fee token accounts created", async () => {
    await hasTokenAccounts(SOLAUTO_FEES_WALLET);
  });

  it("ISM accounts for every supported Marginfi group", async () => {
    let [_, umi] = getSolanaRpcConnection(
      buildHeliusApiUrl(process.env.HELIUS_API_KEY!)
    );

    const ismAccounts = await getEmptyMarginfiAccountsByAuthority(
      umi,
      SOLAUTO_MANAGER,
    );
    const supportedMarginfiGroups = Object.keys(MARGINFI_ACCOUNTS).map(
      (x) => new PublicKey(x)
    );
    const missingIsmAccounts = supportedMarginfiGroups.filter(
      (group) => !ismAccounts.find((x) => group.equals(toWeb3JsPublicKey(x.group)))
    );

    console.log("Missing ISM accounts", missingIsmAccounts);
    assert(missingIsmAccounts.length === 0);
  });
});
