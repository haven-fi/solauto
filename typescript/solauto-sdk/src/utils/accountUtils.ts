import { PublicKey, AccountMeta } from "@solana/web3.js";
import { SOLAUTO_PROGRAM_ID } from "../generated";

export function bufferFromU8(num: number): Buffer {
  const buffer = Buffer.alloc(1);
  buffer.writeUInt8(num);
  return buffer;
}

export function bufferFromU64(num: bigint): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(num);
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

export async function getSolautoPositionAccount(
  signer: PublicKey,
  positionId: number,
) {
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
) {
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

export async function getMarginfiAccountPDA(
  solautoPositionAccount: PublicKey,
  marginfiAccountSeedIdx: bigint
) {
  const seeds = [
    solautoPositionAccount.toBuffer(),
    bufferFromU64(marginfiAccountSeedIdx),
  ];

  const [marginfiAccount, _] = await PublicKey.findProgramAddress(
    seeds,
    new PublicKey(SOLAUTO_PROGRAM_ID)
  );

  return marginfiAccount;
}