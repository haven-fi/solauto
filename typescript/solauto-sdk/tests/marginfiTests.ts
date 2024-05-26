import {
  createSignerFromKeypair,
  signerIdentity,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { getSecretKey, simulateTransaction } from "./testUtils";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { MARGINFI_ACCOUNTS } from "../src/constants/marginfiAccounts";
import {
  SolautoMarginfiInfo,
  newMarginfiSolautoManagedPositionArgs,
} from "../src/instructions/solautoMarginfiInfo";
import { SolautoActionArgs } from "../src/generated";
import { buildSolautoUserInstruction } from "../src/utils/solautoInstructionUtils";
import {
  toWeb3JsKeypair,
  toWeb3JsTransaction,
} from "@metaplex-foundation/umi-web3js-adapters";
import { WSOL_MINT } from "../src/constants/tokenConstants";

const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");
let umi = createUmi(connection);
const secretKey = getSecretKey();
const signerKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
const signer = createSignerFromKeypair(umi, signerKeypair);
// const signerPublicKey = Keypair.fromSecretKey(secretKey).publicKey;

describe("Solauto tests", async () => {
  umi = umi.use(signerIdentity(signer));

  const payForTransactions = false;
  const positionId = 1;

  it("open - deposit - borrow - rebalance (to 0) - withdraw - close", async () => {
    const info = new SolautoMarginfiInfo();
    await info.initialize(
      newMarginfiSolautoManagedPositionArgs(
        signer,
        positionId,
        new PublicKey(MARGINFI_ACCOUNTS.USDC.mint),
        new PublicKey(WSOL_MINT),
        new PublicKey("He4ka5Q3N1UvZikZvykdi47xyk5PoVP2tcQL5sVp31Sz")
      )
    );
    // TODO fix issue with SOL as supply and USDC as debt

    const initialDeposit: SolautoActionArgs = {
      __kind: "Deposit",
      // fields: [BigInt(1000000000)],
      fields: [BigInt(1000000)],
    };

    let tx = transactionBuilder().add([
      info.marginfiOpenPosition(
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
      ),
      info.marginfiProtocolInteraction(initialDeposit),
      // TODO remove the below, borrow instead, rebalance to 0, withdraw remaining supply
      info.marginfiProtocolInteraction({
        __kind: "Withdraw",
        fields: [
          {
            __kind: "Some",
            fields: [BigInt(1000000)],
          },
        ],
      }),
      info.closePositionIx(),
    ]);

    tx = await buildSolautoUserInstruction(tx, info, initialDeposit);

    let transaction = await tx.buildWithLatestBlockhash(umi);
    const web3Transaction = toWeb3JsTransaction(transaction);
    web3Transaction.sign([toWeb3JsKeypair(signerKeypair)]);

    await simulateTransaction(connection, web3Transaction);
    if (payForTransactions) {
      const result = await tx.sendAndConfirm(umi);
      console.log(result.result);
    }
  });
});
