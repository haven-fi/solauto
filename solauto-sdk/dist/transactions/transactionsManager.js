"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionsManager = exports.TransactionStatus = exports.TransactionItem = void 0;
const bs58_1 = __importDefault(require("bs58"));
const umi_1 = require("@metaplex-foundation/umi");
const solanaUtils_1 = require("../utils/solanaUtils");
const generalUtils_1 = require("../utils/generalUtils");
const transactionUtils_1 = require("./transactionUtils");
// import { sendJitoBundledTransactions } from "../utils/jitoUtils";
class LookupTables {
    constructor(defaultLuts, umi) {
        this.defaultLuts = defaultLuts;
        this.umi = umi;
        this.cache = [];
    }
    async getLutInputs(additionalAddresses) {
        const addresses = [...this.defaultLuts, ...additionalAddresses];
        const currentCacheAddresses = this.cache.map((x) => x.publicKey.toString());
        const missingAddresses = addresses.filter((x) => !currentCacheAddresses.includes(x));
        if (missingAddresses) {
            const additionalInputs = await (0, solanaUtils_1.getAdressLookupInputs)(this.umi, missingAddresses);
            this.cache.push(...additionalInputs);
        }
        return this.cache;
    }
}
class TransactionItem {
    constructor(fetchTx, name) {
        this.fetchTx = fetchTx;
        this.name = name;
    }
    async initialize() {
        await this.refetch(0);
    }
    async refetch(attemptNum) {
        const resp = await this.fetchTx(attemptNum);
        this.tx = resp?.tx;
        this.lookupTableAddresses = resp?.lookupTableAddresses ?? [];
    }
    uniqueAccounts() {
        return Array.from(new Set(this.tx.getInstructions()
            .map((x) => [
            x.programId.toString(),
            ...x.keys.map((y) => y.pubkey.toString()),
        ])
            .flat()));
    }
}
exports.TransactionItem = TransactionItem;
class TransactionSet {
    constructor(txHandler, lookupTables, items = []) {
        this.txHandler = txHandler;
        this.lookupTables = lookupTables;
        this.items = items;
    }
    async fitsWith(item) {
        if (!item.tx) {
            return true;
        }
        const accountLocks = Array.from(new Set([
            ...this.items.map((x) => x.uniqueAccounts()),
            ...item.uniqueAccounts(),
        ])).length;
        if (accountLocks > 128) {
            return false;
        }
        return (await this.getSingleTransaction())
            .add(item.tx)
            .setAddressLookupTables(await this.lookupTables.getLutInputs([
            ...this.lutAddresses(),
            ...item.lookupTableAddresses,
        ]))
            .fitsInOneTransaction(this.txHandler.umi);
    }
    add(...items) {
        this.items.push(...items.filter((x) => x.tx && x.tx.getInstructions().length > 0));
    }
    async refetchAll(attemptNum) {
        await this.txHandler.resetLiveTxUpdates();
        for (const item of this.items) {
            await item.refetch(attemptNum);
        }
    }
    async getSingleTransaction() {
        const transactions = this.items
            .filter((x) => x.tx && x.tx.getInstructions().length > 0)
            .map((x) => x.tx);
        return (0, umi_1.transactionBuilder)()
            .add(transactions)
            .setAddressLookupTables(await this.lookupTables.getLutInputs(this.lutAddresses()));
    }
    lutAddresses() {
        return Array.from(new Set(this.items.map((x) => x.lookupTableAddresses).flat()));
    }
    name() {
        const names = this.items
            .filter((x) => x.tx && x.name !== undefined)
            .map((x) => x.name.toLowerCase());
        if (names.length >= 3) {
            return [names.slice(0, -1).join(", "), names[names.length - 1]].join(", and ");
        }
        else {
            return names.join(" & ");
        }
    }
}
var TransactionStatus;
(function (TransactionStatus) {
    TransactionStatus["Skipped"] = "Skipped";
    TransactionStatus["Processing"] = "Processing";
    TransactionStatus["AwaitingSignature"] = "Awaiting Signature";
    TransactionStatus["Queued"] = "Queued";
    TransactionStatus["Successful"] = "Successful";
})(TransactionStatus || (exports.TransactionStatus = TransactionStatus = {}));
class TransactionsManager {
    constructor(txHandler, statusCallback, txType, mustBeAtomic, errorsToThrow) {
        this.txHandler = txHandler;
        this.statusCallback = statusCallback;
        this.txType = txType;
        this.mustBeAtomic = mustBeAtomic;
        this.errorsToThrow = errorsToThrow;
        this.statuses = [];
        this.lookupTables = new LookupTables(this.txHandler.defaultLookupTables(), this.txHandler.umi);
    }
    async assembleTransactionSets(items) {
        let transactionSets = [];
        this.txHandler.log(`Reassembling ${items.length} items`);
        for (let i = 0; i < items.length;) {
            let item = items[i];
            i++;
            if (!item.tx) {
                continue;
            }
            const transaction = item.tx.setAddressLookupTables(await this.lookupTables.getLutInputs(item.lookupTableAddresses));
            if (!transaction.fitsInOneTransaction(this.txHandler.umi)) {
                throw new Error(`Transaction exceeds max transaction size (${transaction.getTransactionSize(this.txHandler.umi)})`);
            }
            else {
                let newSet = new TransactionSet(this.txHandler, this.lookupTables, [
                    item,
                ]);
                for (let j = i; j < items.length; j++) {
                    if (await newSet.fitsWith(items[j])) {
                        newSet.add(items[j]);
                        i++;
                    }
                    else {
                        break;
                    }
                }
                transactionSets.push(newSet);
            }
        }
        return transactionSets;
    }
    updateStatus(name, status, txSig) {
        if (!this.statuses.filter((x) => x.name === name)) {
            this.statuses.push({ name, status, txSig });
        }
        else {
            const idx = this.statuses.findIndex((x) => x.name === name);
            if (idx !== -1) {
                this.statuses[idx].status = status;
                this.statuses[idx].txSig = txSig;
            }
            else {
                this.statuses.push({ name, status, txSig });
            }
        }
        this.txHandler.log(`${name} is ${status.toString().toLowerCase()}`);
        this.statusCallback?.(this.statuses);
    }
    // TODO remove me
    async debugAccounts(itemSet, tx) {
        const lutInputs = await itemSet.lookupTables.getLutInputs([]);
        const lutAccounts = lutInputs.map((x) => x.addresses).flat();
        for (const ix of tx.getInstructions()) {
            const ixAccounts = ix.keys.map((x) => x.pubkey);
            const accountsNotInLut = ixAccounts.filter((x) => !lutAccounts.includes(x));
            this.txHandler.log(`Program ${ix.programId}, data len: ${ix.data.length}, LUT accounts data: ${ix.keys.filter((x) => lutAccounts.includes(x.pubkey)).length * 3}`);
            if (accountsNotInLut.length > 0) {
                this.txHandler.log(`${accountsNotInLut.length} accounts not in LUT:`);
                for (const key of accountsNotInLut) {
                    this.txHandler.log(key.toString());
                }
            }
        }
    }
    async clientSend(transactions, prioritySetting) {
        const items = [...transactions];
        const client = this.txHandler;
        const updateLookupTable = await client.updateLookupTable();
        const updateLutTxName = "update lookup table";
        if (updateLookupTable &&
            updateLookupTable.updateLutTx.getInstructions().length > 0 &&
            updateLookupTable?.needsToBeIsolated) {
            this.updateStatus(updateLutTxName, TransactionStatus.Processing);
            await (0, generalUtils_1.retryWithExponentialBackoff)(async (attemptNum) => await (0, solanaUtils_1.sendSingleOptimizedTransaction)(this.txHandler.umi, this.txHandler.connection, updateLookupTable.updateLutTx, this.txType, attemptNum, prioritySetting, () => this.updateStatus(updateLutTxName, TransactionStatus.AwaitingSignature)), 3, 150, this.errorsToThrow);
            this.updateStatus(updateLutTxName, TransactionStatus.Successful);
        }
        this.lookupTables.defaultLuts = client.defaultLookupTables();
        for (const item of items) {
            await item.initialize();
        }
        const [choresBefore, choresAfter] = await (0, transactionUtils_1.getTransactionChores)(client, (0, umi_1.transactionBuilder)().add(items
            .filter((x) => x.tx && x.tx.getInstructions().length > 0)
            .map((x) => x.tx)));
        if (updateLookupTable && !updateLookupTable.needsToBeIsolated) {
            choresBefore.prepend(updateLookupTable.updateLutTx);
        }
        if (choresBefore.getInstructions().length > 0) {
            const chore = new TransactionItem(async () => ({ tx: choresBefore }), "create account(s)");
            await chore.initialize();
            items.unshift(chore);
            this.txHandler.log("Chores before: ", choresBefore.getInstructions().length);
        }
        if (choresAfter.getInstructions().length > 0) {
            const chore = new TransactionItem(async () => ({ tx: choresAfter }));
            await chore.initialize();
            items.push(chore);
            this.txHandler.log("Chores after: ", choresAfter.getInstructions().length);
        }
        await this.send(items, prioritySetting, true).catch((e) => {
            client.resetLiveTxUpdates(false);
            throw e;
        });
        if (this.txType !== "only-simulate") {
            await client.resetLiveTxUpdates();
        }
    }
    async send(items, prioritySetting, initialized) {
        if (!initialized) {
            for (const item of items) {
                await item.initialize();
            }
        }
        const itemSets = await this.assembleTransactionSets(items);
        const statusesStartIdx = this.statuses.length;
        for (const itemSet of itemSets) {
            this.updateStatus(itemSet.name(), TransactionStatus.Queued);
        }
        if (this.mustBeAtomic && itemSets.length > 1) {
            throw new Error(`${itemSets.length} transactions required but jito bundles are not currently supported`);
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
        }
        else if (this.txType !== "only-simulate" || itemSets.length === 1) {
            for (let i = 0; i < itemSets.length; i++) {
                const getFreshItemSet = async (itemSet, attemptNum) => {
                    await itemSet.refetchAll(attemptNum);
                    const newItemSets = await this.assembleTransactionSets([
                        ...itemSet.items,
                        ...itemSets
                            .slice(i + 1)
                            .map((x) => x.items)
                            .flat(),
                    ]);
                    if (newItemSets.length > 1) {
                        this.statuses.splice(statusesStartIdx + i, itemSets.length - i, ...newItemSets.map((x) => ({
                            name: x.name(),
                            status: TransactionStatus.Queued,
                        })));
                        this.txHandler.log(this.statuses);
                        itemSets.splice(i + 1, itemSets.length - i - 1, ...newItemSets.slice(1));
                    }
                    return newItemSets.length > 0 ? newItemSets[0] : undefined;
                };
                let itemSet = itemSets[i];
                await (0, generalUtils_1.retryWithExponentialBackoff)(async (attemptNum) => {
                    itemSet =
                        i > 0 || attemptNum > 0
                            ? await getFreshItemSet(itemSet, attemptNum)
                            : itemSet;
                    if (!itemSet) {
                        return;
                    }
                    const tx = await itemSet.getSingleTransaction();
                    if (tx.getInstructions().length === 0) {
                        this.updateStatus(itemSet.name(), TransactionStatus.Skipped);
                    }
                    else {
                        this.updateStatus(itemSet.name(), TransactionStatus.Processing);
                        if (this.txHandler.localTest) {
                            await this.debugAccounts(itemSet, tx);
                        }
                        const txSig = await (0, solanaUtils_1.sendSingleOptimizedTransaction)(this.txHandler.umi, this.txHandler.connection, tx, this.txType, attemptNum, prioritySetting, () => this.updateStatus(itemSet.name(), TransactionStatus.AwaitingSignature));
                        this.updateStatus(itemSet.name(), TransactionStatus.Successful, txSig ? bs58_1.default.encode(txSig) : undefined);
                    }
                }, 4, 150, this.errorsToThrow);
            }
        }
    }
}
exports.TransactionsManager = TransactionsManager;
