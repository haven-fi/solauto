import { Umi } from "@metaplex-foundation/umi";
import { Connection, PublicKey } from "@solana/web3.js";
export declare abstract class TxHandler {
    rpcUrl: string;
    umi: Umi;
    connection: Connection;
    referredBy?: PublicKey;
    constructor(rpcUrl: string, localTest?: boolean);
    log(...args: any[]): void;
    abstract defaultLookupTables(): string[];
    abstract resetLiveTxUpdates(success?: boolean): Promise<void>;
    abstract setReferredBy(referredBy?: PublicKey): void;
}
//# sourceMappingURL=txHandler.d.ts.map