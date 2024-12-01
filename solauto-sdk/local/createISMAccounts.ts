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
import { marginfiAccountInitialize, safeFetchAllMarginfiAccount } from "../src/marginfi-sdk";
import { MARGINFI_ACCOUNTS, SOLAUTO_MANAGER } from "../src/constants";
import { getSecretKey } from "./shared";
import { updateSolautoLut } from "./updateSolautoLUT";
import { getAllMarginfiAccountsByAuthority } from "../src/utils";

async function createIntermediarySolautoManagerAccounts() {
  let [connection, umi] = getSolanaRpcConnection(buildHeliusApiUrl(process.env.HELIUS_API_KEY!));

  const secretKey = getSecretKey("solauto-manager");
  const signerKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  const signer = createSignerFromKeypair(umi, signerKeypair);

  umi = umi.use(signerIdentity(signer));

  const accounts = await getAllMarginfiAccountsByAuthority(umi, SOLAUTO_MANAGER, undefined, false);
  const data = await safeFetchAllMarginfiAccount(umi, accounts.map(x => publicKey(x.marginfiAccount)));
  const existingMarginfiGroups = data.map(x => x.group.toString());

  for (const group of Object.keys(MARGINFI_ACCOUNTS)) {
    if (existingMarginfiGroups.includes(group.toString())) {
      console.log("Already have Solauto Manager Marginfi Account for group:", group);
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
