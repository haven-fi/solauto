import { PublicKey } from "@solana/web3.js";
import { LendingPlatform } from "../generated";

export interface SolautoPositionDetails {
  publicKey?: PublicKey;
  authority: PublicKey;
  positionId: number;
  lendingPlatform: LendingPlatform;
  protocolAccount?: PublicKey;
  supplyMint?: PublicKey;
  debtMint?: PublicKey;
}

export enum PriorityFeeSetting {
  Default = "Medium",
  High = "High"
}

export type RebalanceAction = "boost" | "repay" | "dca";