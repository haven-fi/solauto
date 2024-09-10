import "rpc-websockets/dist/lib/client";
import { PublicKey } from "@solana/web3.js";
import { Signer, TransactionBuilder } from "@metaplex-foundation/umi";
import { WalletAdapter } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { DCASettings, DCASettingsInpArgs, LendingPlatform, PositionState, SolautoActionArgs, SolautoPosition, SolautoRebalanceTypeArgs, SolautoSettingsParameters, SolautoSettingsParametersInpArgs, UpdatePositionDataArgs } from "../generated";
import { JupSwapDetails } from "../utils/jupiterUtils";
import { FlashLoanDetails } from "../utils/solauto/rebalanceUtils";
import { LivePositionUpdates } from "../utils/solauto/generalUtils";
import { ReferralStateManager } from "./referralStateManager";
import { TxHandler } from "./txHandler";
export interface SolautoClientArgs {
    authority?: PublicKey;
    positionId: number;
    signer?: Signer;
    wallet?: WalletAdapter;
    supplyMint?: PublicKey;
    debtMint?: PublicKey;
    referredByAuthority?: PublicKey;
}
export declare abstract class SolautoClient extends TxHandler {
    localTest?: boolean | undefined;
    lendingPlatform: LendingPlatform;
    authority: PublicKey;
    signer: Signer;
    positionId: number;
    selfManaged: boolean;
    solautoPosition: PublicKey;
    solautoPositionData: SolautoPosition | null;
    solautoPositionState: PositionState | undefined;
    supplyMint: PublicKey;
    positionSupplyTa: PublicKey;
    signerSupplyTa: PublicKey;
    debtMint: PublicKey;
    positionDebtTa: PublicKey;
    signerDebtTa: PublicKey;
    referralStateManager: ReferralStateManager;
    referredByState?: PublicKey;
    referredByAuthority?: PublicKey;
    referredBySupplyTa?: PublicKey;
    solautoFeesWallet: PublicKey;
    solautoFeesSupplyTa: PublicKey;
    authorityLutAddress?: PublicKey;
    upToDateLutAccounts: PublicKey[];
    livePositionUpdates: LivePositionUpdates;
    constructor(heliusApiKey: string, localTest?: boolean | undefined);
    initialize(args: SolautoClientArgs, lendingPlatform: LendingPlatform): Promise<void>;
    resetLiveTxUpdates(): Promise<void>;
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
    openPosition(settingParams?: SolautoSettingsParametersInpArgs, dca?: DCASettingsInpArgs): TransactionBuilder;
    updatePositionIx(args: UpdatePositionDataArgs): TransactionBuilder;
    closePositionIx(): TransactionBuilder;
    cancelDCAIx(): TransactionBuilder;
    abstract refresh(): TransactionBuilder;
    protocolInteraction(args: SolautoActionArgs): TransactionBuilder;
    abstract flashBorrow(flashLoanDetails: FlashLoanDetails, destinationTokenAccount: PublicKey): TransactionBuilder;
    abstract flashRepay(flashLoanDetails: FlashLoanDetails): TransactionBuilder;
    abstract rebalance(rebalanceStep: "A" | "B", swapDetails: JupSwapDetails, rebalanceType: SolautoRebalanceTypeArgs, flashLoan?: FlashLoanDetails, targetLiqUtilizationRateBps?: number, limitGapBps?: number): TransactionBuilder;
    getFreshPositionState(): Promise<PositionState | undefined>;
}
//# sourceMappingURL=solautoClient.d.ts.map