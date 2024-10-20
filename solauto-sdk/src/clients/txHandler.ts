import { Umi } from "@metaplex-foundation/umi";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  consoleLog,
  createDynamicSolautoProgram,
  getSolanaRpcConnection,
} from "../utils";
import { SOLAUTO_PROD_PROGRAM } from "../constants";

export abstract class TxHandler {
  public rpcUrl!: string;
  public umi!: Umi;
  public connection!: Connection;

  constructor(
    rpcUrl: string,
    localTest?: boolean,
    programId: PublicKey = SOLAUTO_PROD_PROGRAM
  ) {
    this.rpcUrl = rpcUrl;
    const [connection, umi] = getSolanaRpcConnection(this.rpcUrl);
    this.connection = connection;
    this.umi = umi.use({
      install(umi) {
        umi.programs.add(createDynamicSolautoProgram(programId), false);
      },
    });

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
