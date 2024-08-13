import bs58 from "bs58";
import {
  AddressLookupTableInput,
  Instruction,
  transactionBuilder,
  TransactionBuilder,
} from "@metaplex-foundation/umi";
import { SolautoClient } from "../clients/solautoClient";
import {
  getAdressLookupInputs,
  sendSingleOptimizedTransaction,
} from "../utils/solanaUtils";
import {
  ErrorsToThrow,
  retryWithExponentialBackoff,
} from "../utils/generalUtils";
import { getTransactionChores } from "./transactionUtils";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { PriorityFeeSetting } from "../types";
// import { sendJitoBundledTransactions } from "../utils/jitoUtils";

class LookupTables {
  defaultLuts: string[] = [];
  cache: AddressLookupTableInput[] = [];

  constructor(private client: SolautoClient) {
    this.defaultLuts = [...client.defaultLookupTables()];
  }

  async getLutInputs(
    additionalAddresses: string[]
  ): Promise<AddressLookupTableInput[]> {
    const addresses = [
      ...this.defaultLuts,
      this.client.authorityLutAddress!.toString(),
      ...additionalAddresses,
    ];
    const currentCacheAddresses = this.cache.map((x) => x.publicKey.toString());

    const missingAddresses = addresses.filter(
      (x) => !currentCacheAddresses.includes(x)
    );
    if (missingAddresses) {
      const additionalInputs = await getAdressLookupInputs(
        this.client.umi,
        missingAddresses
      );
      this.cache.push(...additionalInputs);
    }

    return this.cache;
  }
}

export class TransactionItem {
  lookupTableAddresses!: string[];
  tx?: TransactionBuilder;

  constructor(
    public fetchTx: (
      attemptNum: number
    ) => Promise<
      { tx: TransactionBuilder; lookupTableAddresses?: string[] } | undefined
    >,
    public name?: string
  ) {}

  async initialize() {
    await this.refetch(0);
  }

  async refetch(attemptNum: number) {
    const resp = await this.fetchTx(attemptNum);
    this.tx = resp?.tx;
    this.lookupTableAddresses = resp?.lookupTableAddresses ?? [];
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

class TransactionSet {
  constructor(
    private client: SolautoClient,
    public lookupTables: LookupTables,
    public items: TransactionItem[] = []
  ) {}

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
    if (accountLocks > 128) {
      return false;
    }

    return (await this.getSingleTransaction())
      .add(item.tx)
      .setAddressLookupTables(
        await this.lookupTables.getLutInputs([
          ...this.lutAddresses(),
          ...item.lookupTableAddresses,
        ])
      )
      .fitsInOneTransaction(this.client.umi);
  }

  add(...items: TransactionItem[]) {
    this.items.push(
      ...items.filter((x) => x.tx && x.tx.getInstructions().length > 0)
    );
  }

  async refetchAll(attemptNum: number) {
    await this.client.resetLivePositionUpdates();
    for (const item of this.items) {
      await item.refetch(attemptNum);
    }
  }

  async getSingleTransaction(): Promise<TransactionBuilder> {
    const transactions = this.items
      .filter((x) => x.tx && x.tx.getInstructions().length > 0)
      .map((x) => x.tx!);

    return transactionBuilder()
      .add(transactions)
      .setAddressLookupTables(
        await this.lookupTables.getLutInputs(this.lutAddresses())
      );
  }

  lutAddresses(): string[] {
    return Array.from(
      new Set(this.items.map((x) => x.lookupTableAddresses).flat())
    );
  }

  name(): string {
    const names = this.items
      .filter((x) => x.tx && x.name !== undefined)
      .map((x) => x.name!.toLowerCase());
    if (names.length >= 3) {
      return [names.slice(0, -1).join(", "), names[names.length - 1]].join(
        ", and "
      );
    } else {
      return names.join(" & ");
    }
  }
}

export enum TransactionStatus {
  Skipped = "Skipped",
  Processing = "Processing",
  Queued = "Queued",
  Successful = "Successful",
}

export type TransactionManagerStatuses = {
  name: string;
  status: TransactionStatus;
  txSig?: string;
}[];

export class TransactionsManager {
  private statuses: TransactionManagerStatuses = [];
  private lookupTables: LookupTables;

  constructor(
    private client: SolautoClient,
    private items: TransactionItem[],
    private statusCallback?: (statuses: TransactionManagerStatuses) => void,
    private simulateOnly?: boolean,
    private mustBeAtomic?: boolean,
    private errorsToThrow?: ErrorsToThrow
  ) {
    this.lookupTables = new LookupTables(client);
  }

  private async assembleTransactionSets(
    items: TransactionItem[]
  ): Promise<TransactionSet[]> {
    let transactionSets: TransactionSet[] = [];
    this.client.log(`Reassembling ${items.length} items`);

    for (let i = 0; i < items.length; ) {
      let item = items[i];
      i++;

      if (!item.tx) {
        continue;
      }

      const transaction = item.tx.setAddressLookupTables(
        await this.lookupTables.getLutInputs(item.lookupTableAddresses)
      );
      if (!transaction.fitsInOneTransaction(this.client.umi)) {
        // TODO: revert me
        // throw new Error(
        //   `Transaction exceeds max transaction size (${transaction.getTransactionSize(this.client.umi)})`
        // );
        transactionSets.push(
          new TransactionSet(this.client, this.lookupTables, [item])
        );
      } else {
        let newSet = new TransactionSet(this.client, this.lookupTables, [item]);
        for (let j = i; j < items.length; j++) {
          if (await newSet.fitsWith(items[j])) {
            newSet.add(items[j]);
            i++;
          } else {
            break;
          }
        }
        transactionSets.push(newSet);
      }
    }

    return transactionSets;
  }

  updateStatus(name: string, status: TransactionStatus, txSig?: string) {
    if (!this.statuses.filter((x) => x.name === name)) {
      this.statuses.push({ name, status, txSig });
    } else {
      const idx = this.statuses.findIndex((x) => x.name === name);
      if (idx !== -1) {
        this.statuses[idx].status = status;
        this.statuses[idx].txSig = txSig;
      } else {
        this.statuses.push({ name, status, txSig });
      }
    }
    this.client.log(`${name} is ${status.toString().toLowerCase()}`);
    this.statusCallback?.(this.statuses);
  }

  // TODO remove me
  async debugAccounts(itemSet: TransactionSet, tx: TransactionBuilder) {
    const lutInputs = await itemSet.lookupTables.getLutInputs([]);
    const lutAccounts = lutInputs.map((x) => x.addresses).flat();
    for (const ix of tx.getInstructions()) {
      const ixAccounts = ix.keys.map((x) => x.pubkey);
      const accountsNotInLut = ixAccounts.filter(
        (x) => !lutAccounts.includes(x)
      );
      this.client.log(`Program ${ix.programId}, data len: ${ix.data.length}, LUT accounts data: ${ix.keys.filter((x) => lutAccounts.includes(x.pubkey)).length * 3}`);
      if (accountsNotInLut.length > 0) {
        this.client.log(`${accountsNotInLut.length} accounts not in LUT:`);
        for (const key of accountsNotInLut) {
          this.client.log(key.toString());
        }
      }
    }
  }

  async send(prioritySetting?: PriorityFeeSetting) {
    const updateLookupTable = await this.client.updateLookupTable();
    if (
      updateLookupTable &&
      updateLookupTable.updateLutTx.getInstructions().length > 0 &&
      updateLookupTable?.needsToBeIsolated
    ) {
      this.updateStatus("update lookup table", TransactionStatus.Processing);
      await retryWithExponentialBackoff(
        async (attemptNum) =>
          await sendSingleOptimizedTransaction(
            this.client.umi,
            this.client.connection,
            updateLookupTable.updateLutTx,
            this.simulateOnly,
            attemptNum
          ),
        3,
        150,
        this.errorsToThrow
      );
      this.updateStatus("update lookup table", TransactionStatus.Successful);
    }

    for (const item of this.items) {
      await item.initialize();
    }

    const [choresBefore, choresAfter] = await getTransactionChores(
      this.client,
      transactionBuilder().add(
        this.items
          .filter((x) => x.tx && x.tx.getInstructions().length > 0)
          .map((x) => x.tx!)
      )
    );
    if (updateLookupTable && !updateLookupTable.needsToBeIsolated) {
      choresBefore.prepend(updateLookupTable.updateLutTx);
    }
    if (choresBefore.getInstructions().length > 0) {
      const chore = new TransactionItem(
        async () => ({ tx: choresBefore }),
        "create account(s)"
      );
      await chore.initialize();
      this.items.unshift(chore);
      this.client.log("Chores before: ", choresBefore.getInstructions().length);
    }
    if (choresAfter.getInstructions().length > 0) {
      const chore = new TransactionItem(async () => ({ tx: choresAfter }));
      await chore.initialize();
      this.items.push(chore);
      this.client.log("Chores after: ", choresAfter.getInstructions().length);
    }

    const itemSets = await this.assembleTransactionSets(this.items);
    const statusesStartIdx = this.statuses.length;
    for (const itemSet of itemSets) {
      this.updateStatus(itemSet.name(), TransactionStatus.Queued);
    }

    if (this.mustBeAtomic && itemSets.length > 1) {
      throw new Error(
        `${itemSets.length} transactions required but jito bundles are not currently supported`
      );
      // itemSets.forEach((set) => {
      //   this.updateStatus(set.name(), TransactionStatus.Processing);
      // });
      // await sendJitoBundledTransactions(
      //   this.client,
      //   await Promise.all(itemSets.map((x) => x.getSingleTransaction())),
      //   this.simulateOnly
      // );
      // TODO: check if successful or not
      // itemSets.forEach((set) => {
      //   this.updateStatus(set.name(), TransactionStatus.Successful);
      // });
    } else if (!this.simulateOnly || itemSets.length === 1) {
      for (let i = 0; i < itemSets.length; i++) {
        const getFreshItemSet = async (
          itemSet: TransactionSet,
          attemptNum: number
        ) => {
          await itemSet.refetchAll(attemptNum);
          const newItemSets = await this.assembleTransactionSets([
            ...itemSet.items,
            ...itemSets
              .slice(i + 1)
              .map((x) => x.items)
              .flat(),
          ]);
          if (newItemSets.length > 1) {
            this.statuses.splice(
              statusesStartIdx + i,
              itemSets.length - i,
              ...newItemSets.map((x) => ({
                name: x.name(),
                status: TransactionStatus.Queued,
              }))
            );
            this.client.log(this.statuses);
            itemSets.splice(
              i + 1,
              itemSets.length - i - 1,
              ...newItemSets.slice(1)
            );
          }
          return newItemSets.length > 0 ? newItemSets[0] : undefined;
        };

        let itemSet: TransactionSet | undefined = itemSets[i];
        await retryWithExponentialBackoff(
          async (attemptNum) => {
            itemSet =
              i > 0 || attemptNum > 0
                ? await getFreshItemSet(itemSet!, attemptNum)
                : itemSet;
            if (!itemSet) {
              return;
            }
            const tx = await itemSet.getSingleTransaction();

            if (tx.getInstructions().length === 0) {
              this.updateStatus(itemSet.name(), TransactionStatus.Skipped);
            } else {
              this.updateStatus(itemSet.name(), TransactionStatus.Processing);

              if (this.client.localTest) {
                await this.debugAccounts(itemSet, tx);
              }

              const txSig = await sendSingleOptimizedTransaction(
                this.client.umi,
                this.client.connection,
                tx,
                this.simulateOnly,
                attemptNum,
                prioritySetting
              );
              this.updateStatus(
                itemSet.name(),
                TransactionStatus.Successful,
                txSig ? bs58.encode(txSig) : undefined
              );
            }
          },
          4,
          150,
          this.errorsToThrow
        );
      }
    }

    if (!this.simulateOnly) {
      await this.client.resetLivePositionUpdates();
    }
  }
}
