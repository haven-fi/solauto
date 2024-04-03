import { PublicKey, Keypair, AccountMeta } from "@solana/web3.js";
import { SOLAUTO_PROGRAM_ID } from "./generated";

export function bufferFromU8(num: number): Buffer {
  const buffer = Buffer.alloc(1);
  buffer.writeUInt8(num);
  return buffer;
}

export function getAccountMeta(
  pubkey: PublicKey | undefined,
  isSigner: boolean,
  isWritable: boolean
): AccountMeta {
  return {
    pubkey: pubkey !== undefined ? pubkey : PublicKey.default,
    isSigner,
    isWritable,
  };
}

export async function getPositionAccount(
  signer: PublicKey,
  positionId: number,
  reuse?: boolean
) {
  if (reuse) {
    return new PublicKey("AwgtJe3D9bhBHLB3T3gmxTtcpd2F3tytTmyNY29ZqcwS");
  }

  const [positionAccount, _] = await PublicKey.findProgramAddress(
    [bufferFromU8(positionId), signer.toBuffer()],
    new PublicKey(SOLAUTO_PROGRAM_ID)
  );

  return positionAccount;
}

export async function getSolendObligationAccount(
  solautoPositionAccount: PublicKey | undefined,
  signer: PublicKey,
  lendingMarket: PublicKey,
  solendProgram: PublicKey,
  reuse?: boolean
) {
  if (reuse) {
    return new PublicKey("9H6TFwHSu1C4SPoUT3JobTXJyrEaTM8zcfMUvYXhSbgh");
  }

  const seeds = [
    signer.toBuffer(),
    lendingMarket.toBuffer(),
    solendProgram.toBuffer(),
  ];

  if (solautoPositionAccount !== undefined) {
    seeds.unshift(solautoPositionAccount.toBuffer());
  }

  const [obligationAccount, _] = await PublicKey.findProgramAddress(
    seeds,
    new PublicKey(SOLAUTO_PROGRAM_ID)
  );

  return obligationAccount;
}