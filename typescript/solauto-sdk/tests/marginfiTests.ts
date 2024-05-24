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
import { WSOL_MINT } from "../src/constants/generalAccounts";
import { SolautoActionArgs } from "../src/generated";
import {
  requestComputeUnitLimitUmiIx,
  tokenAccountChoresAfter,
  tokenAccountChoresBefore,
} from "../src/utils/instructionUtils";
import {
  toWeb3JsKeypair,
  toWeb3JsTransaction,
} from "@metaplex-foundation/umi-web3js-adapters";

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

  it("open - deposit - rebalance - close", async () => {
    const info = new SolautoMarginfiInfo();
    await info.initialize(
      newMarginfiSolautoManagedPositionArgs(
        signer,
        positionId,
        WSOL_MINT,
        new PublicKey(MARGINFI_ACCOUNTS.USDC.mint),
        new PublicKey("He4ka5Q3N1UvZikZvykdi47xyk5PoVP2tcQL5sVp31Sz")
      )
    );

    const initialDeposit: SolautoActionArgs = {
      __kind: "Deposit",
      fields: [BigInt(1000000000)],
    };
    let builder = transactionBuilder().add(
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
      )
    );
    const beforeIx = await tokenAccountChoresBefore(
      info,
      initialDeposit,
      undefined
    );
    if (beforeIx !== undefined) {
      builder = builder.add(beforeIx);
    }

    builder = builder.add(info.marginfiProtocolInteraction(initialDeposit));
    // TODO add rebalance

    const afterIx = tokenAccountChoresAfter(info, initialDeposit, undefined);
    if (afterIx !== undefined) {
      builder = builder.add(afterIx);
    }

    // TODO optimize this
    builder = builder.prepend(requestComputeUnitLimitUmiIx(signer, 500000));

    let tx = await builder.buildWithLatestBlockhash(umi);
    const web3Transaction = toWeb3JsTransaction(tx);
    web3Transaction.sign([toWeb3JsKeypair(signerKeypair)]);

    await simulateTransaction(
      connection,
      web3Transaction,
    );
    if (payForTransactions) {
      const result = await builder.sendAndConfirm(umi);
      console.log(result.result);
    }
  });
});
