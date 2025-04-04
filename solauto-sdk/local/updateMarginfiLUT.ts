import { Keypair, PublicKey } from "@solana/web3.js";
import { MARGINFI_ACCOUNTS_LOOKUP_TABLE } from "../src/constants/marginfiAccounts";
import {
  MARGINFI_ACCOUNTS,
  DEFAULT_MARGINFI_GROUP,
} from "../src/constants/marginfiAccounts";
import {
  MARGINFI_PROGRAM_ID,
  marginfiAccountInitialize,
} from "../src/marginfi-sdk";
import { createAndSendV0Tx, getSecretKey, updateLookupTable } from "./shared";
import {
  buildIronforgeApiUrl,
  getEmptyMarginfiAccountsByAuthority,
  getSolanaRpcConnection,
  SOLAUTO_MANAGER,
} from "../src";
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

const LOOKUP_TABLE_ADDRESS = new PublicKey(MARGINFI_ACCOUNTS_LOOKUP_TABLE);
let [, umi] = getSolanaRpcConnection(
  buildIronforgeApiUrl(process.env.IRONFORGE_API_KEY!)
);
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
  for (const group in MARGINFI_ACCOUNTS) {
    for (const key in MARGINFI_ACCOUNTS[group]) {
      const accounts = MARGINFI_ACCOUNTS[group][key];
      await updateLookupTable(
        [
          group,
          accounts.bank,
          accounts.liquidityVault,
          accounts.vaultAuthority,
          accounts.priceOracle,
        ],
        LOOKUP_TABLE_ADDRESS
      );
    }
  }
}

async function addImfiAccounts() {
  const imfiAccounts = await getEmptyMarginfiAccountsByAuthority(
    umi,
    SOLAUTO_MANAGER
  );

  for (const group in MARGINFI_ACCOUNTS) {
    const emptyAccs = imfiAccounts.filter((x) => x.group.toString() === group);
    if (emptyAccs.length > 0) {
      await updateLookupTable(
        emptyAccs.map((x) => x.publicKey.toString()),
        LOOKUP_TABLE_ADDRESS
      );
    } else {
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

updateLookupTable(
  [DEFAULT_MARGINFI_GROUP, MARGINFI_PROGRAM_ID],
  LOOKUP_TABLE_ADDRESS
);

addBanks().then((x) => x);

addImfiAccounts().then((x) => x);

// EoEVYjz3MnsX6fKyxrwJkRhzMCHKjj6dvnjTCHoZLMc7
// AuoepJfrCrkQF2PeUAgpnnJybRoiff82cNdwXTqyjjvm
// Bno3JybASPc1jNBZ9rnrdKVvbhk6UNMvSsYvgtitq3zb
