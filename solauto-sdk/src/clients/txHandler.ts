import { Umi } from "@metaplex-foundation/umi";
import { Connection } from "@solana/web3.js";
import { consoleLog, getSolanaRpcConnection } from "../utils";

export abstract class TxHandler {
  public rpcUrl!: string;
  public umi!: Umi;
  public connection!: Connection;

  constructor(
    rpcUrl: string,
    localTest?: boolean
  ) {
    this.rpcUrl = rpcUrl;
    const [connection, umi] = getSolanaRpcConnection(this.rpcUrl);
    this.connection = connection;
    this.umi = umi;

    if (!(globalThis as any).LOCAL_TEST && localTest) {
      (globalThis as any).LOCAL_TEST = Boolean(localTest);
    }
  }

  log(...args: any[]): void {
    consoleLog(...args);
  }

  abstract defaultLookupTables(): string[];

  abstract resetLiveTxUpdates(success?: boolean): Promise<void>;
}
