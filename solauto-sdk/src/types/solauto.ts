import { PublicKey } from "@solana/web3.js";
import { LendingPlatform, PositionType } from "../generated";

export interface SolautoPositionDetails {
  publicKey?: PublicKey;
  authority: PublicKey;
  positionId: number;
  positionType: PositionType;
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

export type TransactionRunType = "skip-simulation" | "only-simulate" | "normal";