import { Connection, PublicKey } from "@solana/web3.js";
import { Signer, signerIdentity, Umi } from "@metaplex-foundation/umi";
import {
  WalletAdapter,
  walletAdapterIdentity,
} from "@metaplex-foundation/umi-signer-wallet-adapters";
import { consoleLog, getSolanaRpcConnection } from "../../utils";
import { SOLAUTO_PROD_PROGRAM } from "../../constants";
import { ProgramEnv } from "../../types";

export interface TxHandlerProps {
  signer?: Signer;
  wallet?: WalletAdapter;
  rpcUrl: string;
  showLogs?: boolean;
  programId?: PublicKey;
  lpEnv?: ProgramEnv;
}

export class TxHandler {
  public rpcUrl!: string;
  public showLogs = false;
  public programId!: PublicKey;
  public lpEnv!: ProgramEnv;

  public connection!: Connection;
  public umi!: Umi;
  public signer!: Signer;
  public otherSigners: Signer[] = [];

  constructor(props: TxHandlerProps) {
    this.programId = props.programId ?? SOLAUTO_PROD_PROGRAM;
    this.lpEnv = props.lpEnv ?? "Prod";

    this.rpcUrl = props.rpcUrl;
    const [connection, umi] = getSolanaRpcConnection(
      this.rpcUrl,
      this.programId,
      this.lpEnv
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

  defaultLookupTables(): string[] {
    return [];
  }

  resetLiveTxUpdates(success?: boolean) {}
}
