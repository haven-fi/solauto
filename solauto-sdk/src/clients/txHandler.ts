import { Umi } from "@metaplex-foundation/umi";
import { Connection } from "@solana/web3.js";
import { consoleLog, getSolanaRpcConnection } from "../utils";
import { RUNTIME_DATA } from "../constants";

export abstract class TxHandler {
  public heliusApiUrl!: string;
  public umi!: Umi;
  public connection!: Connection;

  constructor(
    heliusApiUrl: string,
    public localTest?: boolean
  ) {
    this.heliusApiUrl = heliusApiUrl;
    const [connection, umi] = getSolanaRpcConnection(this.heliusApiUrl);
    this.connection = connection;
    this.umi = umi;
    RUNTIME_DATA.localTest = Boolean(localTest);
  }

  log(...args: any[]): void {
    consoleLog(...args);
  }

  abstract defaultLookupTables(): string[];

  abstract resetLiveTxUpdates(success?: boolean): Promise<void>;
}
