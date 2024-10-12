import { PublicKey } from "@solana/web3.js";
import { AccountLayout as SplTokenAccountLayout, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { SOLAUTO_PROGRAM_ID } from "../generated";
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
  signer: PublicKey,
  positionId: number
) {
  const [positionAccount, _] = PublicKey.findProgramAddressSync(
    [bufferFromU8(positionId), signer.toBuffer()],
    new PublicKey(SOLAUTO_PROGRAM_ID)
  );

  return positionAccount;
}

export function getReferralState(authority: PublicKey) {
  const str = "referral_state";
  const strBuffer = Buffer.from(str, "utf-8");

  const [ReferralState, _] = PublicKey.findProgramAddressSync(
    [strBuffer, authority.toBuffer()],
    new PublicKey(SOLAUTO_PROGRAM_ID)
  );

  return ReferralState;
}

export function getMarginfiAccountPDA(
  solautoPositionAccount: PublicKey,
  marginfiAccountSeedIdx: bigint
) {
  const seeds = [
    solautoPositionAccount.toBuffer(),
    bufferFromU64(marginfiAccountSeedIdx),
  ];

  const [marginfiAccount, _] = PublicKey.findProgramAddressSync(
    seeds,
    new PublicKey(SOLAUTO_PROGRAM_ID)
  );

  return marginfiAccount;
}