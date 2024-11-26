import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import switchboardIdl from "../idls/switchboard.json";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { CrossbarClient, PullFeed } from "@switchboard-xyz/on-demand";
import { SWITCHBOARD_PRICE_FEED_IDS } from "../constants/switchboardConstants";
import { TransactionItemInputs } from "../types";
import { Signer, transactionBuilder } from "@metaplex-foundation/umi";
import {
  fromWeb3JsInstruction,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";

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

  return new PullFeed(
    program,
    new PublicKey(SWITCHBOARD_PRICE_FEED_IDS[mint.toString()])
  );
}

export async function buildSwbSubmitResponseTx(
  conn: Connection,
  signer: Signer,
  mint: PublicKey
): Promise<TransactionItemInputs | undefined> {
  const crossbar = new CrossbarClient("https://crossbar.switchboard.xyz");
  const feed = getPullFeed(conn, mint, toWeb3JsPublicKey(signer.publicKey));
  const [pullIx, responses] = await feed.fetchUpdateIx({
    crossbarClient: crossbar,
  });

  return {
    tx: transactionBuilder().add({
      bytesCreatedOnChain: 0,
      instruction: fromWeb3JsInstruction(pullIx!),
      signers: [signer],
    }),
    lookupTableAddresses: responses
      .filter((x) => Boolean(x.oracle.lut?.key))
      .map((x) => x.oracle.lut!.key.toString()),
  };
}
