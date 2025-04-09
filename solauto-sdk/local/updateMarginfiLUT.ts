import { Keypair } from "@solana/web3.js";
import {
  createSignerFromKeypair,
  publicKey,
  signerIdentity,
} from "@metaplex-foundation/umi";
import {
  fromWeb3JsKeypair,
  toWeb3JsInstruction,
  toWeb3JsKeypair,
} from "@metaplex-foundation/umi-web3js-adapters";
import {
  getEmptyMarginfiAccountsByAuthority,
  getSolanaRpcConnection,
  SOLAUTO_MANAGER,
  marginfiAccountInitialize,
  LOCAL_IRONFORGE_API_URL,
  getMarginfiAccounts,
  getAllBankRelatedAccounts,
} from "../src";
import { createAndSendV0Tx, getSecretKey, updateLookupTable } from "./shared";

const mfiAccounts = getMarginfiAccounts("Prod");

const LOOKUP_TABLE_ADDRESS = mfiAccounts.lookupTable;
let [, umi] = getSolanaRpcConnection(LOCAL_IRONFORGE_API_URL);
umi = umi.use(
  signerIdentity(
    createSignerFromKeypair(umi, umi.eddsa.generateKeypair()),
    true
  )
);
const solautoManagerKeypair = Keypair.fromSecretKey(
  getSecretKey("solauto-manager")
);
const solautoManager = createSignerFromKeypair(
  umi,
  fromWeb3JsKeypair(solautoManagerKeypair)
);

async function addBanks() {
  const accounts = await getAllBankRelatedAccounts(
    umi,
    mfiAccounts.bankAccounts
  );
  await updateLookupTable(
    accounts.map((x) => x.toString()),
    LOOKUP_TABLE_ADDRESS
  );
}

async function addImfiAccounts() {
  const imfiAccounts = await getEmptyMarginfiAccountsByAuthority(
    umi,
    SOLAUTO_MANAGER
  );

  const iMfiAccountsPerGrp = 2;
  for (const group in mfiAccounts.bankAccounts) {
    const emptyAccs = imfiAccounts.filter((x) => x.group.toString() === group);
    if (emptyAccs.length >= iMfiAccountsPerGrp) {
      await updateLookupTable(
        emptyAccs.map((x) => x.publicKey.toString()),
        LOOKUP_TABLE_ADDRESS
      );
    } else {
      for (let i = 0; i < iMfiAccountsPerGrp - emptyAccs.length; i++) {
        console.log("Creating Imfi account for group:", group);
        const iMfiAccountKeypair = umi.eddsa.generateKeypair();
        const iMfiAccount = createSignerFromKeypair(umi, iMfiAccountKeypair);
        const umiIx = marginfiAccountInitialize(umi, {
          marginfiAccount: iMfiAccount,
          marginfiGroup: publicKey(group),
          authority: solautoManager,
          feePayer: solautoManager,
        });
        const ix = toWeb3JsInstruction(umiIx.getInstructions()[0]);
        await createAndSendV0Tx([ix], solautoManagerKeypair, [
          toWeb3JsKeypair(iMfiAccountKeypair),
        ]);
        await updateLookupTable(
          [iMfiAccount.publicKey.toString()],
          LOOKUP_TABLE_ADDRESS
        );
      }
    }
  }
}

updateLookupTable(
  [mfiAccounts.defaultGroup.toString(), mfiAccounts.program.toString()],
  LOOKUP_TABLE_ADDRESS
);

addBanks().then((x) => x);

addImfiAccounts().then((x) => x);
