import { Signer, TransactionBuilder } from "@metaplex-foundation/umi";
import { PublicKey } from "@solana/web3.js";
import { SolautoClient, SolautoClientArgs } from "./solautoClient";
import { MarginfiAssetAccounts } from "../types/accounts";
import { DCASettingsInpArgs, PositionState, SolautoActionArgs, SolautoRebalanceTypeArgs, SolautoSettingsParametersInpArgs } from "../generated";
import { MarginfiAccount } from "../marginfi-sdk";
import { JupSwapDetails } from "../utils/jupiterUtils";
import { FlashLoanDetails } from "../utils/solauto/rebalanceUtils";
export interface SolautoMarginfiClientArgs extends SolautoClientArgs {
    marginfiAccount?: PublicKey | Signer;
    marginfiAccountSeedIdx?: bigint;
    marginfiGroup?: PublicKey;
}
export declare class SolautoMarginfiClient extends SolautoClient {
    private initialized;
    marginfiProgram: PublicKey;
    marginfiAccountSeedIdx: bigint;
    marginfiAccount: PublicKey | Signer;
    marginfiAccountPk: PublicKey;
    marginfiGroup: PublicKey;
    marginfiSupplyAccounts: MarginfiAssetAccounts;
    marginfiDebtAccounts: MarginfiAssetAccounts;
    supplyPriceOracle: PublicKey;
    debtPriceOracle: PublicKey;
    intermediaryMarginfiAccountSigner?: Signer;
    intermediaryMarginfiAccountPk: PublicKey;
    intermediaryMarginfiAccount?: MarginfiAccount;
    initialize(args: SolautoMarginfiClientArgs): Promise<void>;
    setIntermediaryMarginfiDetails(): Promise<void>;
    protocolAccount(): PublicKey;
    defaultLookupTables(): string[];
    lutAccountsToAdd(): PublicKey[];
    maxLtvAndLiqThresholdBps(): Promise<[number, number] | undefined>;
    marginfiAccountInitialize(): TransactionBuilder;
    openPosition(settingParams?: SolautoSettingsParametersInpArgs, dca?: DCASettingsInpArgs): TransactionBuilder;
    private marginfiOpenPositionIx;
    refresh(): TransactionBuilder;
    protocolInteraction(args: SolautoActionArgs): TransactionBuilder;
    private marginfiProtocolInteractionIx;
    private marginfiSolautoProtocolInteractionIx;
    rebalance(rebalanceStep: "A" | "B", swapDetails: JupSwapDetails, rebalanceType: SolautoRebalanceTypeArgs, flashLoan?: FlashLoanDetails, targetLiqUtilizationRateBps?: number): TransactionBuilder;
    flashBorrow(flashLoanDetails: FlashLoanDetails, destinationTokenAccount: PublicKey): TransactionBuilder;
    flashRepay(flashLoanDetails: FlashLoanDetails): TransactionBuilder;
    createIntermediaryMarginfiAccount(): TransactionBuilder;
    getFreshPositionState(): Promise<PositionState | undefined>;
}
//# sourceMappingURL=solautoMarginfiClient.d.ts.map