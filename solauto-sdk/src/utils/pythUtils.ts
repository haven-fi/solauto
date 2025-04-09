import { PublicKey } from "@solana/web3.js";
import { PYTH_PUSH_PROGRAM } from "../constants";
import { u16ToArrayBufferLE, zip } from "./generalUtils";
import * as borsh from "borsh";
import { Umi } from "@metaplex-foundation/umi";
import { fromWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";

type PriceUpdateV2 = {
  writeAuthority: Buffer;
  verificationLevel: number;
  priceMessage: {
    feedId: Buffer;
    price: bigint;
    conf: bigint;
    exponent: number;
    publishTime: bigint;
    prevPublishTime: bigint;
    emaPrice: bigint;
    emaConf: bigint;
  };
};

const priceUpdateV2Schema = {
  struct: {
    writeAuthority: {
      array: { type: "u8", len: 32 },
    },
    verificationLevel: "u8",
    priceMessage: {
      struct: {
        feedId: { array: { type: "u8", len: 32 } },
        price: "i64",
        conf: "u64",
        exponent: "i32",
        publishTime: "i64",
        prevPublishTime: "i64",
        emaPrice: "i64",
        emaConf: "u64",
      },
    },
    postedSlot: "u64",
  },
};

export function parsePriceInfo(data: Uint8Array): PriceUpdateV2 {
  let decoded: PriceUpdateV2 = borsh.deserialize(
    priceUpdateV2Schema,
    data
  ) as any;
  return decoded;
}

export async function getMostUpToDatePythOracle(
  umi: Umi,
  oracleKeys: PublicKey[]
) {
  const oracles = zip(
    oracleKeys,
    (
      await umi.rpc.getAccounts(
        oracleKeys.map((x) => fromWeb3JsPublicKey(x)),
        { commitment: "confirmed" }
      )
    ).map((x) => (x.exists ? parsePriceInfo(x!.data.slice(8)) : undefined))
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
