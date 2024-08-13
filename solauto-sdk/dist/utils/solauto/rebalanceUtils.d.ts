import { PublicKey } from "@solana/web3.js";
import { SolautoClient } from "../../clients/solautoClient";
import { QuoteResponse } from "@jup-ag/api";
import { JupSwapDetails } from "../jupiterUtils";
export interface RebalanceValues {
    increasingLeverage: boolean;
    debtAdjustmentUsd: number;
    amountUsdToDcaIn: number;
}
export declare function getRebalanceValues(client: SolautoClient, targetLiqUtilizationRateBps?: number, limitGapBps?: number): RebalanceValues;
export interface FlashLoanDetails {
    baseUnitAmount: bigint;
    mint: PublicKey;
}
export declare function getFlashLoanDetails(client: SolautoClient, values: RebalanceValues, jupQuote: QuoteResponse): FlashLoanDetails | undefined;
export declare function getJupSwapRebalanceDetails(client: SolautoClient, values: RebalanceValues, targetLiqUtilizationRateBps?: number, attemptNum?: number): JupSwapDetails;
//# sourceMappingURL=rebalanceUtils.d.ts.map