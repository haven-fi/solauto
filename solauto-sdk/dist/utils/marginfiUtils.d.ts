import { PublicKey } from "@solana/web3.js";
import { Umi } from "@metaplex-foundation/umi";
import { Bank, MarginfiAccount } from "../marginfi-sdk";
import { MarginfiAssetAccounts } from "../types/accounts";
import { PositionState } from "../generated";
import { LivePositionUpdates } from "./solauto/generalUtils";
export declare function findMarginfiAccounts(bank: PublicKey): MarginfiAssetAccounts;
export declare function marginfiMaxLtvAndLiqThresholdBps(supplyBank: Bank, debtBank: Bank, supplyPrice: number): [number, number];
export declare function getMaxLtvAndLiqThreshold(umi: Umi, marginfiGroup: PublicKey, supply: {
    mint: PublicKey;
    bank?: Bank | null;
}, debt: {
    mint: PublicKey;
    bank?: Bank | null;
}, supplyPrice?: number): Promise<[number, number]>;
export declare function getAllMarginfiAccountsByAuthority(umi: Umi, authority: PublicKey, compatibleWithSolauto?: boolean): Promise<{
    marginfiAccount: PublicKey;
    supplyMint?: PublicKey;
    debtMint?: PublicKey;
}[]>;
interface BankSelection {
    mint?: PublicKey;
    banksCache?: BanksCache;
}
type BanksCache = {
    [group: string]: {
        [mint: string]: Bank;
    };
};
export declare function getMarginfiAccountPositionState(umi: Umi, protocolAccount: {
    pk: PublicKey;
    data?: MarginfiAccount;
}, marginfiGroup?: PublicKey, supply?: BankSelection, debt?: BankSelection, livePositionUpdates?: LivePositionUpdates): Promise<PositionState | undefined>;
export declare function calculateAnnualAPYs(bank: Bank): [number, number];
export declare function getUpToDateShareValues(bank: Bank): Promise<[number, number]>;
export {};
//# sourceMappingURL=marginfiUtils.d.ts.map