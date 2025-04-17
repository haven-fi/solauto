import { TransactionBuilder } from "@metaplex-foundation/umi";
import { TransactionItemInputs } from "../../../types";

export class TransactionItem {
  lookupTableAddresses!: string[];
  tx?: TransactionBuilder;
  initialized: boolean = false;
  orderPrio: number = 0;

  constructor(
    public fetchTx: (
      attemptNum: number,
      prevError?: Error
    ) => Promise<TransactionItemInputs | undefined>,
    public name?: string,
    public oracleInteractor?: boolean
  ) {}

  async initialize() {
    await this.refetch(0);
    this.initialized = true;
  }

  async refetch(attemptNum: number, prevError?: Error) {
    const resp = await this.fetchTx(attemptNum, prevError);
    this.tx = resp?.tx;
    this.lookupTableAddresses = resp?.lookupTableAddresses ?? [];
    this.orderPrio = resp?.orderPrio ?? 0;
  }

  uniqueAccounts(): string[] {
    return Array.from(
      new Set(
        this.tx!.getInstructions()
          .map((x) => [
            x.programId.toString(),
            ...x.keys.map((y) => y.pubkey.toString()),
          ])
          .flat()
      )
    );
  }
}
