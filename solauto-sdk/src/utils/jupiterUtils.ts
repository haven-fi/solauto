import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { retryWithExponentialBackoff } from "./generalUtils";
import { Instruction } from "@jup-ag/api";

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
  const data = await retryWithExponentialBackoff(async () => {
    const res = await (
      await fetch(
        "https://api.jup.ag/price/v2?ids=" +
          mints.map((x) => x.toString()).join(",") +
          "&showExtraInfo=true"
      )
    ).json();
    const result = res.data;
    if (!result || result === null || typeof result !== "object") {
      throw new Error("Failed to get token prices using Jupiter");
    }

    const trueData: { [key: string]: any } = Object.entries(
      result as { [key: string]: any }
    ).reduce(
      (acc, [key, val]) =>
        !val?.extraInfo?.quotedPrice?.sellAt
          ? { ...acc, [key]: { ...val, price: "0" } }
          : { ...acc, [key]: val },
      {}
    );

    return trueData;
  }, 3);

  return data;
}
