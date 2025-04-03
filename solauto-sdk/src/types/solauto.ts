import { PublicKey } from "@solana/web3.js";
import {
  LendingPlatform,
  PositionType,
  SolautoRebalanceType,
  TokenType,
} from "../generated";
import { TransactionBuilder } from "@metaplex-foundation/umi";
import { RebalanceValues } from "../services/rebalance";
import { QuoteResponse } from "@jup-ag/api";

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
  None = "None",
  Min = "Min",
  Low = "Low",
  Default = "Medium",
  High = "High",
  VeryHigh = "VeryHigh",
}

export const priorityFeeSettingValues = Object.values(
  PriorityFeeSetting
) as PriorityFeeSetting[];

export type RebalanceAction = "boost" | "repay" | "dca";

export type TransactionRunType = "skip-simulation" | "only-simulate" | "normal";

export interface TransactionItemInputs {
  tx: TransactionBuilder;
  lookupTableAddresses?: string[];
  orderPrio?: number;
}

export interface FlashLoanRequirements {
  liquiditySource: TokenType;
  signerFlashLoan?: boolean;
  flFeeBps?: number;
}

export interface FlashLoanDetails extends FlashLoanRequirements {
  baseUnitAmount: bigint;
  mint: PublicKey;
}

export interface RebalanceDetails {
  values: RebalanceValues;
  rebalanceType: SolautoRebalanceType;
  flashLoan?: FlashLoanDetails;
  swapQuote: QuoteResponse;
  targetLiqUtilizationRateBps?: number;
}
