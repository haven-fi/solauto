import { PublicKey } from "@solana/web3.js";
import { AccountLayout as SplTokenAccountLayout, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { publicKey, Umi } from "@metaplex-foundation/umi";

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

export async function getTokenAccountData(umi: Umi, tokenAccount: PublicKey) {
  const resp = await umi.rpc.getAccount(publicKey(tokenAccount), { commitment: "confirmed" });
  if (resp.exists) {
    return SplTokenAccountLayout.decode(resp.data);
  } else {
    return undefined;
  }
}

export function getSolautoPositionAccount(
  authority: PublicKey,
  positionId: number,
  programId: PublicKey
) {
  const [positionAccount, _] = PublicKey.findProgramAddressSync(
    [bufferFromU8(positionId), authority.toBuffer()],
    programId
  );

  return positionAccount;
}

export function getReferralState(authority: PublicKey, programId: PublicKey) {
  const str = "referral_state";
  const strBuffer = Buffer.from(str, "utf-8");

  const [ReferralState, _] = PublicKey.findProgramAddressSync(
    [strBuffer, authority.toBuffer()],
    programId
  );

  return ReferralState;
}

export function getMarginfiAccountPDA(
  solautoPositionAccount: PublicKey,
  marginfiAccountSeedIdx: bigint,
  programId: PublicKey
) {
  const seeds = [
    solautoPositionAccount.toBuffer(),
    bufferFromU64(marginfiAccountSeedIdx),
  ];

  const [marginfiAccount, _] = PublicKey.findProgramAddressSync(
    seeds,
    programId
  );

  return marginfiAccount;
}