import {
  createSignerFromKeypair,
  publicKey,
  signerIdentity,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import {
  buildHeliusApiUrl,
  getSolanaRpcConnection,
  sendSingleOptimizedTransaction,
} from "../src/utils/solanaUtils";
import { marginfiAccountInitialize } from "../src/marginfi-sdk";
import { DEFAULT_MARGINFI_GROUP } from "../src/constants";
import { getSecretKey } from "./shared";
import { updateSolautoLut } from "./updateSolautoLUT";

async function create() {
  let [connection, umi] = getSolanaRpcConnection(buildHeliusApiUrl(process.env.HELIUS_API_KEY!));

  const secretKey = getSecretKey("solauto-manager");
  const signerKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  const signer = createSignerFromKeypair(umi, signerKeypair);

  umi = umi.use(signerIdentity(signer));

  const marginfiAccount = createSignerFromKeypair(
    umi,
    umi.eddsa.generateKeypair()
  );
  console.log(marginfiAccount.publicKey);

  const tx = marginfiAccountInitialize(umi, {
    marginfiAccount,
    marginfiGroup: publicKey(DEFAULT_MARGINFI_GROUP),
    authority: signer,
    feePayer: signer,
  });

  await sendSingleOptimizedTransaction(
    umi,
    connection,
    transactionBuilder().add(tx)
  );

  await updateSolautoLut([marginfiAccount.publicKey.toString()]);
}

create();
