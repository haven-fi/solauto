import { describe, it } from "mocha";
import { assert } from "chai";
import { PublicKey } from "@solana/web3.js";
import { publicKey } from "@metaplex-foundation/umi";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import {
  ALL_SUPPORTED_TOKENS,
  TOKEN_INFO,
  SOLAUTO_FEES_WALLET,
  SOLAUTO_MANAGER,
  LOCAL_IRONFORGE_API_URL,
  getMarginfiAccounts,
  getSolanaRpcConnection,
  getEmptyMarginfiAccountsByAuthority,
  getTokenAccount,
} from "../../src";

async function hasTokenAccounts(wallet: PublicKey) {
  let [_, umi] = getSolanaRpcConnection(LOCAL_IRONFORGE_API_URL);

  const tokenAccounts = await umi.rpc.getAccounts(
    ALL_SUPPORTED_TOKENS.map((x) =>
      publicKey(getTokenAccount(wallet, new PublicKey(x)))
    )
  );
  for (let i = 0; i < tokenAccounts.length; i++) {
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
    let [_, umi] = getSolanaRpcConnection(LOCAL_IRONFORGE_API_URL);

    const ismAccounts = await getEmptyMarginfiAccountsByAuthority(
      umi,
      SOLAUTO_MANAGER
    );
    const supportedMarginfiGroups = Object.keys(
      getMarginfiAccounts("Prod").bankAccounts
    ).map((x) => new PublicKey(x));
    const missingIsmAccounts = supportedMarginfiGroups.filter(
      (group) =>
        !ismAccounts.find((x) => group.equals(toWeb3JsPublicKey(x.group)))
    );

    if (missingIsmAccounts.length > 0) {
      console.log("Missing ISM accounts", missingIsmAccounts);
    }
    assert(missingIsmAccounts.length === 0);
  });
});
