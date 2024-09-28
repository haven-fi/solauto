import { Umi } from "@metaplex-foundation/umi";
import { Connection } from "@solana/web3.js";
export declare abstract class TxHandler {
    localTest?: boolean | undefined;
    heliusApiUrl: string;
    umi: Umi;
    connection: Connection;
    constructor(heliusApiUrl: string, localTest?: boolean | undefined);
    log(...args: any[]): void;
    abstract defaultLookupTables(): string[];
    abstract resetLiveTxUpdates(success?: boolean): Promise<void>;
}
//# sourceMappingURL=txHandler.d.ts.map