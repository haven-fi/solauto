import {
  AddressLookupTableInput,
  transactionBuilder,
  TransactionBuilder,
} from "@metaplex-foundation/umi";
import { TxHandler } from "../../solauto";
import { LookupTables } from "./lookupTables";
import { TransactionItem } from "./transactionItem";
import { addTxOptimizations } from "../../../utils";
import { CHORES_TX_NAME } from "../../../constants";

const MAX_SUPPORTED_ACCOUNT_LOCKS = 64;

export class TransactionSet {
  constructor(
    private txHandler: TxHandler,
    public lookupTables: LookupTables,
    public items: TransactionItem[] = []
  ) {}

  async lutInputs(): Promise<AddressLookupTableInput[]> {
    const lutInputs = await this.lookupTables.getLutInputs(this.lutAddresses());

    return lutInputs.filter(
      (lut, index, self) =>
        index ===
        self.findIndex(
          (item) => item.publicKey.toString() === lut.publicKey.toString()
        )
    );
  }

  async fitsWith(item: TransactionItem): Promise<boolean> {
    if (!item.tx) {
      return true;
    }

    const accountLocks = Array.from(
      new Set([
        ...this.items.map((x) => x.uniqueAccounts()),
        ...item.uniqueAccounts(),
      ])
    ).length;
    if (accountLocks > MAX_SUPPORTED_ACCOUNT_LOCKS) {
      return false;
    }

    const singleTx = await this.getSingleTransaction();
    const tx = addTxOptimizations(this.txHandler.umi, singleTx, 1, 1)
      .add(item.tx)
      .setAddressLookupTables(
        await this.lookupTables.getLutInputs([
          ...this.lutAddresses(),
          ...item.lookupTableAddresses,
        ])
      );

    return tx.fitsInOneTransaction(this.txHandler.umi);
  }

  add(...items: TransactionItem[]) {
    this.items.push(
      ...items.filter((x) => x.tx && x.tx.getInstructions().length > 0)
    );
  }

  prepend(...items: TransactionItem[]) {
    this.items.unshift(
      ...items.filter((x) => x.tx && x.tx.getInstructions().length > 0)
    );
  }

  async reset() {
    await this.txHandler.resetLiveTxUpdates();
  }

  async refetchAll(attemptNum: number, prevError?: Error) {
    for (const item of this.items) {
      await item.refetch(attemptNum, prevError);
    }
  }

  async getSingleTransaction(): Promise<TransactionBuilder> {
    const transactions = this.items
      .filter((x) => x.tx && x.tx.getInstructions().length > 0)
      .map((x) => x.tx!);

    return transactionBuilder()
      .add(transactions)
      .setAddressLookupTables(await this.lutInputs());
  }

  lutAddresses(): string[] {
    return Array.from(
      new Set(this.items.map((x) => x.lookupTableAddresses).flat())
    );
  }

  name(): string {
    let names = this.items
      .filter((x) => x.tx && Boolean(x.name))
      .map((x) => x.name!.toLowerCase());
    if (names.length > 1) {
      names = names.filter((x) => x !== CHORES_TX_NAME);
    }
    if (names.length >= 3) {
      return [names.slice(0, -1).join(", "), names[names.length - 1]].join(
        ", and "
      );
    } else {
      return names.join(" & ");
    }
  }
}
