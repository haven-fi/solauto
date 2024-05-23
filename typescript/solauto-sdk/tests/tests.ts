import {
  Transaction,
  UmiPlugin,
  createSignerFromKeypair,
  publicKey,
  signerIdentity,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  toWeb3JsKeypair,
  toWeb3JsLegacyTransaction,
} from "@metaplex-foundation/umi-web3js-adapters";
import {
  createSolautoProgram,
  deserializeSolautoPosition,
  marginfiOpenPosition,
  solendOpenPosition,
} from "../src/generated";
import { generateRandomU64, generateRandomU8 } from "../src/utils/generalUtils";
import { getSecretKey } from "./testUtils";
import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  clusterApiUrl,
} from "@solana/web3.js";
import { MARGINFI_ACCOUNTS } from "../src/constants/marginfiAccounts";
import {
  getSolautoPositionAccount,
  getSolendObligationAccount,
} from "../src/utils/accountUtils";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { assert, expect } from "chai";
import {
  SolautoMarginfiInfo,
  newMarginfiSolautoManagedPositionArgs,
} from "../src/instructions/solautoMarginfiInfo";
import { WSOL_MINT } from "../src/constants/generalAccounts";

const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");
let umi = createUmi(connection);
const secretKey = getSecretKey();
const signerKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
const signer = createSignerFromKeypair(umi, signerKeypair);
const signerPublicKey = Keypair.fromSecretKey(secretKey).publicKey;

async function simulateTransaction(transaction: Transaction) {
  const web3Transaction = toWeb3JsLegacyTransaction(transaction);
  web3Transaction.sign(toWeb3JsKeypair(signerKeypair));

  const simulationResult = await connection.simulateTransaction(
    web3Transaction
  );
  if (simulationResult.value.err) {
    console.log(simulationResult.value.logs);
  }
  assert.equal(simulationResult.value.err, undefined);
}

export const solauto = (): UmiPlugin => ({
  install(umi) {
    umi.programs.add(createSolautoProgram(), false);
  },
});

describe("Solauto tests", async () => {
  umi = umi.use(solauto()).use(signerIdentity(signer));

  const payForTransactions = false;
  const positionId = 0;

  it("e2e", async () => {
    const solautoMarginfiInfo = new SolautoMarginfiInfo();
    await solautoMarginfiInfo.initialize(
      newMarginfiSolautoManagedPositionArgs(
        signer,
        positionId,
        WSOL_MINT,
        new PublicKey(MARGINFI_ACCOUNTS.USDC.mint),
        new PublicKey("He4ka5Q3N1UvZikZvykdi47xyk5PoVP2tcQL5sVp31Sz")
      )
    );

    const builder = solautoMarginfiInfo.marginfiOpenPosition(
      {
        boostToBps: 5000,
        boostGap: 500,
        repayToBps: 8500,
        repayGap: 500,
        automation: {
          __option: "None",
        },
        targetBoostToBps: {
          __option: "None",
        },
      },
      undefined
    );

    const transaction = await builder.buildWithLatestBlockhash(umi);
    await simulateTransaction(transaction);
    if (payForTransactions) {
      await builder.sendAndConfirm(umi);
    }
  });
});
