import { Signer, signerIdentity, Umi } from "@metaplex-foundation/umi";
import { Connection, PublicKey } from "@solana/web3.js";
import { consoleLog, getSolanaRpcConnection } from "../../utils";
import { SOLAUTO_PROD_PROGRAM } from "../../constants";
import {
  WalletAdapter,
  walletAdapterIdentity,
} from "@metaplex-foundation/umi-signer-wallet-adapters";

export interface TxHandlerProps {
  signer?: Signer;
  wallet?: WalletAdapter;
  rpcUrl: string;
  showLogs?: boolean;
  programId?: PublicKey;
  wsEndpoint?: string;
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
    if (props.programId !== undefined) {
      this.programId = props.programId;
    }

    this.rpcUrl = props.rpcUrl;
    const [connection, umi] = getSolanaRpcConnection(
      this.rpcUrl,
      this.programId,
      props.wsEndpoint
    );
    this.connection = connection;
    this.umi = umi;

    if (!props.signer && !props.wallet) {
      throw new Error("Signer or wallet must be provided");
    }
    this.umi = this.umi.use(
      props.signer
        ? signerIdentity(props.signer, true)
        : walletAdapterIdentity(props.wallet!, true)
    );
    this.signer = this.umi.identity;

    if (props.showLogs !== undefined) {
      this.showLogs = props.showLogs;
    }

    if (!(globalThis as any).SHOW_LOGS && this.showLogs) {
      (globalThis as any).SHOW_LOGS = Boolean(this.showLogs);
    }
  }

  log(...args: any[]): void {
    consoleLog(...args);
  }

  abstract defaultLookupTables(): string[];

  abstract resetLiveTxUpdates(success?: boolean): Promise<void>;
}
