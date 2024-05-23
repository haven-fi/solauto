import { PublicKey, AccountMeta } from "@solana/web3.js";
import { SOLAUTO_PROGRAM_ID } from "../generated";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";

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

export function getTokenAccount(wallet: PublicKey, tokenMint: PublicKey) {
  return getAssociatedTokenAddressSync(
    tokenMint,
    wallet,
    true
  );
}

export async function getSolautoPositionAccount(
  signer: PublicKey,
  positionId: number
) {
  const [positionAccount, _] = await PublicKey.findProgramAddress(
    [bufferFromU8(positionId), signer.toBuffer()],
    new PublicKey(SOLAUTO_PROGRAM_ID)
  );

  return positionAccount;
}

export async function getReferralStateAccount(authority: PublicKey) {
  const str = "referral_state";
  const strBuffer = Buffer.from(str, "utf-8");

  const [referralStateAccount, _] = await PublicKey.findProgramAddress(
    [strBuffer, authority.toBuffer()],
    new PublicKey(SOLAUTO_PROGRAM_ID)
  );

  return referralStateAccount;
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

export async function getSolendObligationAccount(
  solautoPositionAccount: PublicKey | undefined,
  signer: PublicKey,
  lendingMarket: PublicKey,
  solendProgram: PublicKey
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
