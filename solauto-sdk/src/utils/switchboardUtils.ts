import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { Signer, transactionBuilder } from "@metaplex-foundation/umi";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import * as OnDemand from "@switchboard-xyz/on-demand";
import Big from "big.js";
import { PRICES, SWITCHBOARD_PRICE_FEED_IDS } from "../constants";
import { TransactionItemInputs } from "../types";
import {
  currentUnixSeconds,
  retryWithExponentialBackoff,
} from "./generalUtils";
import { getWrappedInstruction } from "./solanaUtils";

export async function getPullFeed(
  conn: Connection,
  mint: PublicKey,
  wallet?: PublicKey
) {
  const dummyWallet = {
    publicKey: wallet ?? new PublicKey("11111111111111111111111111111111"),
    signTransaction: async <T extends Transaction | VersionedTransaction>(
      tx: T
    ): Promise<T> => tx,
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(
      txs: T[]
    ): Promise<T[]> => txs,
  };
  const provider = new AnchorProvider(
    conn,
    dummyWallet,
    AnchorProvider.defaultOptions()
  );
  const { PullFeed, ON_DEMAND_MAINNET_PID } = OnDemand;
  const sbProgram = await Program.at(ON_DEMAND_MAINNET_PID, provider);

  console.log(new PublicKey(SWITCHBOARD_PRICE_FEED_IDS[mint.toString()].feedId).toString())
  return new PullFeed(
    sbProgram,
    new PublicKey(SWITCHBOARD_PRICE_FEED_IDS[mint.toString()].feedId)
  );
}

export async function buildSwbSubmitResponseTx(
  conn: Connection,
  signer: Signer,
  mint: PublicKey
): Promise<TransactionItemInputs | undefined> {
  const feed = await getPullFeed(
    conn,
    mint,
    toWeb3JsPublicKey(signer.publicKey)
  );
  const gateway = await feed.fetchGatewayUrl();
  const [pullIxs, responses] = await retryWithExponentialBackoff(
    async () => {
      const res = await feed.fetchUpdateIx({
        gateway: gateway,
        chain: "solana",
        network: "mainnet",
      });
      if (!res[1] || !res[1][0].value) {
        throw new Error("Unable to fetch Switchboard pull IX");
      }
      return res;
    },
    3,
    200
  );

  if (!pullIxs || !pullIxs.length) {
    throw new Error("Unable to fetch SWB crank IX");
  }

  const price = (responses[0].value as Big).toNumber();
  PRICES[mint.toString()] = {
    realtimePrice: price,
    confInterval: 0,
    emaPrice: price,
    emaConfInterval: 0,
    time: currentUnixSeconds(),
  };

  return {
    tx: transactionBuilder(
      pullIxs.map((x) => getWrappedInstruction(signer, x))
    ),
    lookupTableAddresses: responses
      .filter((x) => Boolean(x.oracle.lut?.key))
      .map((x) => x.oracle.lut!.key.toString()),
  };
}

export async function getSwitchboardFeedData(
  conn: Connection,
  mints: PublicKey[]
): Promise<{ mint: PublicKey; price: number; stale: boolean }[]> {
  if (mints.length === 0) {
    return [];
  }

  const currSlot = await retryWithExponentialBackoff(
    async () => await conn.getSlot("confirmed"),
    5
  );

  const results = await Promise.all(
    mints.map(async (mint) => {
      const feed = await getPullFeed(conn, mint);
      const result = await feed.loadData();
      const price = Number(result.result.value) / Math.pow(10, 18);
      const stale =
        currSlot > result.result.slot.toNumber() + result.maxStaleness;

      return { mint, price, stale };
    })
  );

  return results;
}

export function isSwitchboardMint(mint: PublicKey | string) {
  return Object.keys(SWITCHBOARD_PRICE_FEED_IDS).includes(mint.toString());
}
