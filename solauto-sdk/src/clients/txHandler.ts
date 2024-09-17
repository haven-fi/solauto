import { Umi } from "@metaplex-foundation/umi";
import { Connection } from "@solana/web3.js";
import { getSolanaRpcConnection } from "../utils";


export abstract class TxHandler {
  public heliusApiKey!: string;
  public umi!: Umi;
  public connection!: Connection;

  constructor(heliusApiKey: string,
    public localTest?: boolean) {
      this.heliusApiKey = heliusApiKey;
      const [connection, umi] = getSolanaRpcConnection(this.heliusApiKey);
      this.connection = connection;
      this.umi = umi;
  }

  log(...args: any[]): void {
    if (this.localTest) {
      console.log(...args);
    }
  }

  abstract defaultLookupTables(): string[];

  abstract resetLiveTxUpdates(success?: boolean): Promise<void>;
}