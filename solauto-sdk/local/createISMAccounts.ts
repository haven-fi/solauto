import {
  createSignerFromKeypair,
  publicKey,
  signerIdentity,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import {
  getSolanaRpcConnection,
  sendSingleOptimizedTransaction,
  getAllMarginfiAccountsByAuthority,
} from "../src/utils";
import {
  marginfiAccountInitialize,
  safeFetchAllMarginfiAccount,
} from "../src/marginfi-sdk";
import {
  LOCAL_IRONFORGE_API_URL,
  MARGINFI_ACCOUNTS,
  SOLAUTO_MANAGER,
} from "../src/constants";
import { updateSolautoLut } from "./updateSolautoLUT";
import { getSecretKey } from "./shared";

async function createIntermediarySolautoManagerAccounts() {
  let [connection, umi] = getSolanaRpcConnection(LOCAL_IRONFORGE_API_URL);

  const secretKey = getSecretKey("solauto-manager");
  const signerKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  const signer = createSignerFromKeypair(umi, signerKeypair);

  umi = umi.use(signerIdentity(signer));

  const accounts = await getAllMarginfiAccountsByAuthority(
    umi,
    SOLAUTO_MANAGER,
    undefined,
    false
  );
  const data = await safeFetchAllMarginfiAccount(
    umi,
    accounts.map((x) => publicKey(x.marginfiAccount))
  );
  const existingMarginfiGroups = data.map((x) => x.group.toString());

  for (const group of Object.keys(MARGINFI_ACCOUNTS)) {
    if (existingMarginfiGroups.includes(group.toString())) {
      console.log(
        "Already have Solauto Manager Marginfi Account for group:",
        group
      );
      continue;
    }

    const marginfiAccount = createSignerFromKeypair(
      umi,
      umi.eddsa.generateKeypair()
    );

    const tx = marginfiAccountInitialize(umi, {
      marginfiAccount,
      marginfiGroup: publicKey(group),
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
}

createIntermediarySolautoManagerAccounts();
