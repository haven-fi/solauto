import { Connection, PublicKey } from "@solana/web3.js";
import { PYTH_PUSH_ORACLE_ID } from "../constants";
import { u16ToArrayBufferLE } from "./generalUtils";
import * as borsh from "borsh";

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

export const parsePriceInfo = (data: Buffer): PriceUpdateV2 => {
  let decoded: PriceUpdateV2 = borsh.deserialize(
    priceUpdateV2Schema,
    data
  ) as any;
  return decoded;
};

export async function getPythOracle(
  connection: Connection,
  oracleKey: PublicKey
) {
  const pythOracle = findPythPushOracleAddress(
    oracleKey.toBuffer(),
    PYTH_PUSH_ORACLE_ID,
    PYTH_SPONSORED_SHARD_ID
  );
  const mfiOracle = findPythPushOracleAddress(
    oracleKey.toBuffer(),
    PYTH_PUSH_ORACLE_ID,
    MARGINFI_SPONSORED_SHARD_ID
  );

  const [pythSponsoredOracle, mfiSponsoredOracle] =
    await connection.getMultipleAccountsInfo([pythOracle, mfiOracle]);

  if (mfiSponsoredOracle && pythSponsoredOracle) {
    let pythPriceAccount = parsePriceInfo(pythSponsoredOracle.data.slice(8));
    let pythPublishTime = pythPriceAccount.priceMessage.publishTime;

    let mfiPriceAccount = parsePriceInfo(mfiSponsoredOracle.data.slice(8));
    let mfiPublishTime = mfiPriceAccount.priceMessage.publishTime;

    console.log("Pyth:", pythOracle.toString());
    console.log("Mfi:", mfiOracle.toString());
    if (pythPublishTime > mfiPublishTime) {
      return pythOracle;
    } else {
      return mfiOracle;
    }
  } else if (pythSponsoredOracle) {
    return pythOracle;
  } else if (mfiSponsoredOracle) {
    return mfiOracle;
  } else {
    throw new Error(
      `No oracle found for feedId: ${oracleKey}, either Pyth or MFI sponsored oracle must exist`
    );
  }
}

export const PYTH_SPONSORED_SHARD_ID = 0;
export const MARGINFI_SPONSORED_SHARD_ID = 3301;

export function findPythPushOracleAddress(
  feedId: Buffer,
  programId: PublicKey,
  shardId: number
): PublicKey {
  const shardBytes = u16ToArrayBufferLE(shardId);
  return PublicKey.findProgramAddressSync([shardBytes, feedId], programId)[0];
}
