import { PublicKey } from "@solana/web3.js";
import {
  createSignerFromKeypair,
  publicKey,
  signerIdentity,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import {
  ALL_SUPPORTED_TOKENS,
  LOCAL_IRONFORGE_API_URL,
  SOLAUTO_FEES_WALLET,
} from "../src/constants";
import {
  createAssociatedTokenAccountUmiIx,
  getSolanaRpcConnection,
  getTokenAccount,
  sendSingleOptimizedTransaction,
  zip,
} from "../src/utils";
import { getSecretKey } from "./shared";

async function createTokenAccounts(wallet: PublicKey) {
  let [connection, umi] = getSolanaRpcConnection(LOCAL_IRONFORGE_API_URL);

  const secretKey = getSecretKey();
  const signerKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  const signer = createSignerFromKeypair(umi, signerKeypair);

  umi = umi.use(signerIdentity(signer));

  const tokenAccounts = await umi.rpc.getAccounts(
    ALL_SUPPORTED_TOKENS.map((x) =>
      publicKey(getTokenAccount(wallet, new PublicKey(x)))
    )
  );

  for (const accounts of zip(tokenAccounts, ALL_SUPPORTED_TOKENS)) {
    if (!accounts[0].exists) {
      const tx = createAssociatedTokenAccountUmiIx(
        signer,
        wallet,
        new PublicKey(accounts[1])
      );
      await sendSingleOptimizedTransaction(
        umi,
        connection,
        transactionBuilder().add(tx)
      );
    }
  }
}

createTokenAccounts(SOLAUTO_FEES_WALLET).catch((e) => console.log(e));
