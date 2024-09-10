import { Umi } from "@metaplex-foundation/umi";
import { Connection } from "@solana/web3.js";
export declare abstract class TxHandler {
    localTest?: boolean | undefined;
    heliusApiKey: string;
    umi: Umi;
    connection: Connection;
    constructor(heliusApiKey: string, localTest?: boolean | undefined);
    log(...args: any[]): void;
    abstract defaultLookupTables(): string[];
    abstract resetLiveTxUpdates(): Promise<void>;
}
//# sourceMappingURL=txHandler.d.ts.map