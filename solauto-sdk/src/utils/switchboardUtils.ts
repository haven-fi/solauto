import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import switchboardIdl from "../idls/switchboard.json";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import * as OnDemand from "@switchboard-xyz/on-demand";
import { SWITCHBOARD_PRICE_FEED_IDS } from "../constants/switchboardConstants";
import { TransactionItemInputs } from "../types";
import { Signer, transactionBuilder } from "@metaplex-foundation/umi";
import {
  fromWeb3JsInstruction,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import { retryWithExponentialBackoff, zip } from "./generalUtils";

export function getPullFeed(
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
  const program = new Program(switchboardIdl as Idl, provider);

  const { PullFeed } = OnDemand;
  return new PullFeed(
    program,
    new PublicKey(SWITCHBOARD_PRICE_FEED_IDS[mint.toString()].feedId)
  );
}

export async function buildSwbSubmitResponseTx(
  conn: Connection,
  signer: Signer,
  mint: PublicKey
): Promise<TransactionItemInputs | undefined> {
  const feed = getPullFeed(conn, mint, toWeb3JsPublicKey(signer.publicKey));
  const [pullIxs, responses] = await retryWithExponentialBackoff(
    async () => await feed.fetchUpdateIx({}),
    2,
    200
  );

  return {
    tx: transactionBuilder(
      pullIxs!.map((x) => {
        return {
          bytesCreatedOnChain: 0,
          instruction: fromWeb3JsInstruction(x),
          signers: [signer],
        };
      })
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
      const feed = getPullFeed(conn, mint);
      const result = await feed.loadData();
      const price = Number(result.result.value) / Math.pow(10, 18);
      const stale =
        currSlot > result.result.slot.toNumber() + result.maxStaleness;

      return { mint, price, stale };
    })
  );

  return results;
}
