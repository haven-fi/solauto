import { Signer, signerIdentity, Umi } from "@metaplex-foundation/umi";
import { Connection, PublicKey } from "@solana/web3.js";
import { consoleLog, getSolanaRpcConnection } from "../../utils";
import { SOLAUTO_PROD_PROGRAM } from "../../constants";
import {
  WalletAdapter,
  walletAdapterIdentity,
} from "@metaplex-foundation/umi-signer-wallet-adapters";

export interface TxHandlerProps {
  rpcUrl: string;
  showLogs?: boolean;
  programId?: PublicKey;
  wsEndpoint?: string;
}

export interface TxHandlerArgs {
  signer?: Signer;
  wallet?: WalletAdapter;
}

export abstract class TxHandler {
  public rpcUrl!: string;
  public showLogs = false;
  public programId = SOLAUTO_PROD_PROGRAM;

  public connection!: Connection;
  public umi!: Umi;
  public signer!: Signer;
  public otherSigners: Signer[] = [];

  constructor(props: TxHandlerProps) {
    this.rpcUrl = props.rpcUrl;
    if (props.showLogs !== undefined) {
      this.showLogs = props.showLogs;
    }
    if (props.programId !== undefined) {
      this.programId = props.programId;
    }

    const [connection, umi] = getSolanaRpcConnection(
      this.rpcUrl,
      this.programId,
      props.wsEndpoint
    );
    this.connection = connection;
    this.umi = umi;

    if (!(globalThis as any).SHOW_LOGS && this.showLogs) {
      (globalThis as any).SHOW_LOGS = Boolean(this.showLogs);
    }
  }

  async initialize(args: TxHandlerArgs) {
    if (!args.signer && !args.wallet) {
      throw new Error("Signer or wallet must be provided");
    }
    this.umi = this.umi.use(
      args.signer
        ? signerIdentity(args.signer, true)
        : walletAdapterIdentity(args.wallet!, true)
    );
    this.signer = this.umi.identity;
  }

  log(...args: any[]): void {
    consoleLog(...args);
  }

  abstract defaultLookupTables(): string[];

  abstract resetLiveTxUpdates(success?: boolean): Promise<void>;
}
