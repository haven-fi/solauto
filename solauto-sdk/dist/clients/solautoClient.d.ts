import "rpc-websockets/dist/lib/client";
import { PublicKey } from "@solana/web3.js";
import { Signer, TransactionBuilder } from "@metaplex-foundation/umi";
import { DCASettings, DCASettingsInpArgs, LendingPlatform, PositionState, SolautoActionArgs, SolautoPosition, SolautoRebalanceTypeArgs, SolautoSettingsParameters, SolautoSettingsParametersInpArgs, UpdatePositionDataArgs } from "../generated";
import { FlashLoanDetails, RebalanceValues } from "../utils/solauto/rebalanceUtils";
import { LivePositionUpdates } from "../utils/solauto/generalUtils";
import { ReferralStateManager, ReferralStateManagerArgs } from "./referralStateManager";
import { QuoteResponse } from "@jup-ag/api";
export interface SolautoClientArgs extends ReferralStateManagerArgs {
    new?: boolean;
    positionId?: number;
    supplyMint?: PublicKey;
    debtMint?: PublicKey;
}
export declare abstract class SolautoClient extends ReferralStateManager {
    lendingPlatform?: LendingPlatform;
    authority: PublicKey;
    signer: Signer;
    positionId: number;
    selfManaged: boolean;
    solautoPosition: PublicKey;
    solautoPositionData: SolautoPosition | null;
    solautoPositionState: PositionState | undefined;
    maxLtvBps?: number;
    liqThresholdBps?: number;
    supplyMint: PublicKey;
    positionSupplyTa: PublicKey;
    signerSupplyTa: PublicKey;
    debtMint: PublicKey;
    positionDebtTa: PublicKey;
    signerDebtTa: PublicKey;
    solautoFeesWallet: PublicKey;
    solautoFeesSupplyTa: PublicKey;
    authorityLutAddress?: PublicKey;
    livePositionUpdates: LivePositionUpdates;
    initialize(args: SolautoClientArgs): Promise<void>;
    referredBySupplyTa(): PublicKey | undefined;
    resetLiveTxUpdates(success?: boolean): Promise<void>;
    abstract protocolAccount(): PublicKey;
    defaultLookupTables(): string[];
    lutAccountsToAdd(): PublicKey[];
    fetchExistingAuthorityLutAccounts(): Promise<PublicKey[]>;
    updateLookupTable(): Promise<{
        updateLutTx: TransactionBuilder;
        needsToBeIsolated: boolean;
    } | undefined>;
    solautoPositionSettings(): SolautoSettingsParameters | undefined;
    solautoPositionActiveDca(): DCASettings | undefined;
    maxLtvAndLiqThresholdBps(): Promise<[number, number] | undefined>;
    openPosition(settingParams?: SolautoSettingsParametersInpArgs, dca?: DCASettingsInpArgs): TransactionBuilder;
    updatePositionIx(args: UpdatePositionDataArgs): TransactionBuilder;
    closePositionIx(): TransactionBuilder;
    cancelDCAIx(): TransactionBuilder;
    abstract refresh(): TransactionBuilder;
    protocolInteraction(args: SolautoActionArgs): TransactionBuilder;
    abstract flashBorrow(flashLoanDetails: FlashLoanDetails, destinationTokenAccount: PublicKey): TransactionBuilder;
    abstract flashRepay(flashLoanDetails: FlashLoanDetails): TransactionBuilder;
    abstract rebalance(rebalanceStep: "A" | "B", jupQuote: QuoteResponse, rebalanceType: SolautoRebalanceTypeArgs, rebalanceValues: RebalanceValues, flashLoan?: FlashLoanDetails, targetLiqUtilizationRateBps?: number): TransactionBuilder;
    getFreshPositionState(): Promise<PositionState | undefined>;
}
//# sourceMappingURL=solautoClient.d.ts.map