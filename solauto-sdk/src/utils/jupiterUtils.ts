import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { Instruction } from "@jup-ag/api";
import { getBatches, retryWithExponentialBackoff } from "./generalUtils";

export function jupIxToSolanaIx(
  instruction: Instruction
): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((key) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(instruction.data, "base64"),
  });
}

export async function getJupPriceData(mints: PublicKey[]) {
  const batches = getBatches(mints, 50);

  const results = await Promise.all(
    batches.map((batch) =>
      retryWithExponentialBackoff(async () => {
        const res = await (
          await fetch(
            "https://lite-api.jup.ag/price/v3?ids=" +
              batch.map((x) => x.toString()).join(",")
          )
        ).json();

        if (!res || typeof res !== "object") {
          throw new Error("Failed to get token prices using Jupiter");
        }

        return res;
      }, 4)
    )
  );

  const mergedResults = Object.assign({}, ...results);

  return mergedResults;
}
