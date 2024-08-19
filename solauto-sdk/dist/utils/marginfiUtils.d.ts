import { PublicKey } from "@solana/web3.js";
import { Umi } from "@metaplex-foundation/umi";
import { Bank } from "../marginfi-sdk";
import { MarginfiAssetAccounts } from "../types/accounts";
import { PositionState } from "../generated";
import { LivePositionUpdates } from "./solauto/generalUtils";
export declare function findMarginfiAccounts({ mint, bank, }: {
    mint?: string;
    bank?: string;
}): MarginfiAssetAccounts;
export declare function getMaxLtvAndLiqThreshold(umi: Umi, supply: {
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
export declare function getMarginfiAccountPositionState(umi: Umi, marginfiAccountPk: PublicKey, supplyMint?: PublicKey, debtMint?: PublicKey, livePositionUpdates?: LivePositionUpdates): Promise<PositionState | undefined>;
export declare function getUpToDateShareValues(umi: Umi, bank: Bank): Promise<[number, number]>;
//# sourceMappingURL=marginfiUtils.d.ts.map