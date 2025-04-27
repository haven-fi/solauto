import { PublicKey } from "@solana/web3.js";
import { publicKey, Umi } from "@metaplex-foundation/umi";
import { PYTH_PUSH_PROGRAM } from "../constants";
import { u16ToArrayBufferLE, zip } from "./generalUtils";
import { safeFetchAllPriceUpdateV2Account } from "../pyth-sdk";

export async function getMostUpToDatePythOracle(
  umi: Umi,
  oracleKeys: PublicKey[]
) {
  const oracles = zip(
    oracleKeys,
    await safeFetchAllPriceUpdateV2Account(
      umi,
      oracleKeys.map((x) => publicKey(x)),
      { commitment: "confirmed" }
    )
  ).sort(
    (a, b) =>
      Number(b[1]?.priceMessage.publishTime ?? 0) -
      Number(a[1]?.priceMessage.publishTime ?? 0)
  );

  return oracles[0][0];
}

export function getPythPushOracleAddress(
  feedId: PublicKey,
  shardId: number,
  programId: PublicKey = PYTH_PUSH_PROGRAM
): PublicKey {
  const shardBytes = u16ToArrayBufferLE(shardId);
  return PublicKey.findProgramAddressSync(
    [shardBytes, feedId.toBuffer()],
    programId
  )[0];
}
