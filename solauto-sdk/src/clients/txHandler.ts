import { Signer, Umi } from "@metaplex-foundation/umi";
import { Connection, PublicKey } from "@solana/web3.js";
import { consoleLog, getSolanaRpcConnection } from "../utils";
import { SOLAUTO_PROD_PROGRAM } from "../constants";

export abstract class TxHandler {
  public connection!: Connection;
  public umi!: Umi;
  public signer!: Signer;
  public otherSigners: Signer[] = [];

  constructor(
    public rpcUrl: string,
    localTest?: boolean,
    public programId: PublicKey = SOLAUTO_PROD_PROGRAM,
    public wsEndpoint?: string
  ) {
    const [connection, umi] = getSolanaRpcConnection(
      this.rpcUrl,
      this.programId,
      wsEndpoint
    );
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
