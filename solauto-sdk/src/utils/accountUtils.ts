import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
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

export function getTokenAccount(wallet: PublicKey, tokenMint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(
    tokenMint,
    wallet,
    true
  );
}

export function getTokenAccounts(wallet: PublicKey, tokenMints: PublicKey[]): PublicKey[] {
  return tokenMints.map(x => getTokenAccount(wallet, x));
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

export async function getReferralState(authority: PublicKey) {
  const str = "referral_state";
  const strBuffer = Buffer.from(str, "utf-8");

  const [ReferralState, _] = await PublicKey.findProgramAddress(
    [strBuffer, authority.toBuffer()],
    new PublicKey(SOLAUTO_PROGRAM_ID)
  );

  return ReferralState;
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