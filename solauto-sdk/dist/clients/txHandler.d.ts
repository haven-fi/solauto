import { Umi } from "@metaplex-foundation/umi";
import { Connection, PublicKey } from "@solana/web3.js";
export declare abstract class TxHandler {
    rpcUrl: string;
    umi: Umi;
    connection: Connection;
    constructor(rpcUrl: string, localTest?: boolean, programId?: PublicKey);
    log(...args: any[]): void;
    abstract defaultLookupTables(): string[];
    abstract resetLiveTxUpdates(success?: boolean): Promise<void>;
}
//# sourceMappingURL=txHandler.d.ts.map