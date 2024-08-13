import { Signer, TransactionBuilder } from "@metaplex-foundation/umi";
import { PublicKey } from "@solana/web3.js";
import { QuoteResponse } from "@jup-ag/api";
export interface JupSwapDetails {
    inputMint: PublicKey;
    outputMint: PublicKey;
    destinationWallet: PublicKey;
    amount: bigint;
    slippageBpsIncFactor?: number;
    exactOut?: boolean;
    exactIn?: boolean;
}
export interface JupSwapTransaction {
    jupQuote: QuoteResponse;
    lookupTableAddresses: string[];
    setupInstructions: TransactionBuilder;
    tokenLedgerIx: TransactionBuilder;
    swapIx: TransactionBuilder;
}
export declare function getJupSwapTransaction(signer: Signer, swapDetails: JupSwapDetails, attemptNum?: number): Promise<JupSwapTransaction>;
//# sourceMappingURL=jupiterUtils.d.ts.map