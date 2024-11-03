"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionsManager = exports.TransactionStatus = exports.TransactionItem = exports.TransactionTooLargeError = void 0;
const bs58_1 = __importDefault(require("bs58"));
const umi_1 = require("@metaplex-foundation/umi");
const solanaUtils_1 = require("../utils/solanaUtils");
const generalUtils_1 = require("../utils/generalUtils");
const transactionUtils_1 = require("./transactionUtils");
const types_1 = require("../types");
const web3_js_1 = require("@solana/web3.js");
// import { sendJitoBundledTransactions } from "../utils/jitoUtils";
const CHORES_TX_NAME = "account chores";
class TransactionTooLargeError extends Error {
    constructor(message) {
        super(message);
        this.name = "TransactionTooLargeError";
        Object.setPrototypeOf(this, TransactionTooLargeError.prototype);
    }
}
exports.TransactionTooLargeError = TransactionTooLargeError;
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
            const additionalInputs = await (0, solanaUtils_1.getAddressLookupInputs)(this.umi, missingAddresses);
            this.cache.push(...additionalInputs);
        }
        return this.cache;
    }
    reset() {
        this.cache = this.cache.filter((x) => this.defaultLuts.includes(x.publicKey.toString()));
    }
}
class TransactionItem {
    constructor(fetchTx, name) {
        this.fetchTx = fetchTx;
        this.name = name;
        this.initialized = false;
    }
    async initialize() {
        await this.refetch(0);
        this.initialized = true;
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
        const singleTx = await this.getSingleTransaction();
        return (0, solanaUtils_1.addTxOptimizations)(this.txHandler.umi.identity, singleTx, 1, 1)
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
        const lutInputs = await this.lookupTables.getLutInputs(this.lutAddresses());
        this.txHandler.log(lutInputs);
        return (0, umi_1.transactionBuilder)()
            .add(transactions)
            .setAddressLookupTables(lutInputs);
    }
    lutAddresses() {
        return Array.from(new Set(this.items.map((x) => x.lookupTableAddresses).flat()));
    }
    name() {
        let names = this.items
            .filter((x) => x.tx && x.name !== undefined)
            .map((x) => x.name.toLowerCase());
        if (names.length > 1) {
            names = names.filter((x) => x !== CHORES_TX_NAME);
        }
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
    TransactionStatus["Queued"] = "Queued";
    TransactionStatus["Successful"] = "Successful";
    TransactionStatus["Failed"] = "Failed";
})(TransactionStatus || (exports.TransactionStatus = TransactionStatus = {}));
class TransactionsManager {
    constructor(txHandler, statusCallback, txType, priorityFeeSetting = types_1.PriorityFeeSetting.Min, errorsToThrow, retries = 4, retryDelay = 150) {
        this.txHandler = txHandler;
        this.statusCallback = statusCallback;
        this.txType = txType;
        this.priorityFeeSetting = priorityFeeSetting;
        this.errorsToThrow = errorsToThrow;
        this.retries = retries;
        this.retryDelay = retryDelay;
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
                throw new TransactionTooLargeError(`Exceeds max transaction size (${transaction.getTransactionSize(this.txHandler.umi)})`);
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
    updateStatus(name, status, attemptNum, txSig, simulationSuccessful, moreInfo) {
        if (!this.statuses.filter((x) => x.name === name)) {
            this.statuses.push({
                name,
                status,
                txSig,
                attemptNum,
                simulationSuccessful,
                moreInfo,
            });
        }
        else {
            const idx = this.statuses.findIndex((x) => x.name === name && x.attemptNum === attemptNum);
            if (idx !== -1) {
                this.statuses[idx].status = status;
                this.statuses[idx].txSig = txSig;
                if (simulationSuccessful) {
                    this.statuses[idx].simulationSuccessful = simulationSuccessful;
                }
                if (moreInfo) {
                    this.statuses[idx].moreInfo = moreInfo;
                }
            }
            else {
                this.statuses.push({
                    name,
                    status,
                    txSig,
                    attemptNum,
                    simulationSuccessful,
                    moreInfo,
                });
            }
        }
        this.txHandler.log(`${name} is ${status.toString().toLowerCase()}`);
        this.statusCallback?.([...this.statuses]);
    }
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
    getUpdatedPriorityFeeSetting(prevError) {
        if (prevError instanceof web3_js_1.TransactionExpiredBlockheightExceededError) {
            const currIdx = types_1.priorityFeeSettingValues.indexOf(this.priorityFeeSetting);
            return types_1.priorityFeeSettingValues[Math.min(types_1.priorityFeeSettingValues.length - 1, currIdx + 1)];
        }
        return this.priorityFeeSetting;
    }
    updateStatusForSets(itemSets) {
        itemSets.forEach((itemSet) => {
            this.updateStatus(itemSet.name(), TransactionStatus.Queued, 0);
        });
    }
    async updateLut(tx, newLut) {
        const updateLutTxName = `${newLut ? "create" : "update"} lookup table`;
        await (0, generalUtils_1.retryWithExponentialBackoff)(async (attemptNum, prevError) => await this.sendTransaction(tx, updateLutTxName, attemptNum, this.getUpdatedPriorityFeeSetting(prevError)), 3, 150, this.errorsToThrow);
    }
    async clientSend(transactions) {
        const items = [...transactions];
        const client = this.txHandler;
        const updateLookupTable = await client.updateLookupTable();
        if (updateLookupTable && updateLookupTable?.new) {
            await this.updateLut(updateLookupTable.tx, updateLookupTable.new);
        }
        this.lookupTables.defaultLuts = client.defaultLookupTables();
        for (const item of items) {
            await item.initialize();
        }
        let [choresBefore, choresAfter] = await (0, transactionUtils_1.getTransactionChores)(client, (0, umi_1.transactionBuilder)().add(items
            .filter((x) => x.tx && x.tx.getInstructions().length > 0)
            .map((x) => x.tx)));
        if (updateLookupTable && !updateLookupTable?.new) {
            choresBefore = choresBefore.prepend(updateLookupTable.tx);
            this.txHandler.log(updateLookupTable.tx
                .getInstructions()
                .map((x) => x.programId.toString()));
        }
        if (choresBefore.getInstructions().length > 0) {
            const chore = new TransactionItem(async () => ({ tx: choresBefore }), CHORES_TX_NAME);
            await chore.initialize();
            items.unshift(chore);
            this.txHandler.log("Chores before: ", choresBefore.getInstructions().length);
        }
        if (choresAfter.getInstructions().length > 0) {
            const chore = new TransactionItem(async () => ({ tx: choresAfter }), CHORES_TX_NAME);
            await chore.initialize();
            items.push(chore);
            this.txHandler.log("Chores after: ", choresAfter.getInstructions().length);
        }
        const result = await this.send(items).catch((e) => {
            client.resetLiveTxUpdates(false);
            throw e;
        });
        if (this.txType !== "only-simulate") {
            await client.resetLiveTxUpdates();
        }
        return result;
    }
    async send(items) {
        this.statuses = [];
        this.lookupTables.reset();
        if (!items[0].initialized) {
            for (const item of items) {
                await item.initialize();
            }
        }
        this.txHandler.log("Transaction items:", items.length);
        const itemSets = await this.assembleTransactionSets(items);
        this.updateStatusForSets(itemSets);
        this.txHandler.log("Initial item sets:", itemSets.length);
        for (const itemSet of itemSets) {
            const programs = (await itemSet.getSingleTransaction())
                .getInstructions()
                .map((x) => x.programId);
            this.txHandler.log(programs.map((x) => x.toString()));
        }
        if (this.txType === "only-simulate" && itemSets.length > 1) {
            this.txHandler.log("Only simulate and more than 1 transaction. Skipping...");
            return [];
        }
        let currentIndex = 0;
        while (currentIndex < itemSets.length) {
            await this.processTransactionSet(itemSets, currentIndex);
            currentIndex++;
        }
        return this.statuses;
    }
    async processTransactionSet(itemSets, currentIndex) {
        let itemSet = itemSets[currentIndex];
        let num = 0;
        await (0, generalUtils_1.retryWithExponentialBackoff)(async (attemptNum, prevError) => {
            num = attemptNum;
            if (currentIndex > 0 || attemptNum > 0) {
                itemSet = await this.refreshItemSet(itemSets, currentIndex, attemptNum);
            }
            if (!itemSet)
                return;
            const tx = await itemSet.getSingleTransaction();
            if (tx.getInstructions().length === 0) {
                this.updateStatus(itemSet.name(), TransactionStatus.Skipped, attemptNum);
            }
            else {
                await this.debugAccounts(itemSet, tx);
                await this.sendTransaction(tx, itemSet.name(), attemptNum, this.getUpdatedPriorityFeeSetting(prevError));
            }
        }, this.retries, this.retryDelay, this.errorsToThrow).catch((e) => {
            if (itemSet) {
                this.updateStatus(itemSet.name(), TransactionStatus.Failed, num, undefined, undefined, e.message);
            }
            throw e;
        });
    }
    async refreshItemSet(itemSets, currentIndex, attemptNum) {
        const itemSet = itemSets[currentIndex];
        await itemSet.refetchAll(attemptNum);
        const newItemSets = await this.assembleTransactionSets([
            ...itemSet.items,
            ...itemSets.slice(currentIndex + 1).flatMap((set) => set.items),
        ]);
        if (newItemSets.length > 1) {
            itemSets.splice(currentIndex, itemSets.length - currentIndex, ...newItemSets);
            const startOfQueuedStatuses = this.statuses.findIndex((x) => x.status === TransactionStatus.Queued);
            this.statuses.splice(startOfQueuedStatuses, this.statuses.length - startOfQueuedStatuses, ...newItemSets.map((x, i) => ({
                name: x.name(),
                attemptNum: i === 0 ? attemptNum : 0,
                status: i === 0 ? TransactionStatus.Processing : TransactionStatus.Queued,
            })));
        }
        return newItemSets[0];
    }
    async sendTransaction(tx, txName, attemptNum, priorityFeeSetting) {
        this.updateStatus(txName, TransactionStatus.Processing, attemptNum);
        try {
            const txSig = await (0, solanaUtils_1.sendSingleOptimizedTransaction)(this.txHandler.umi, this.txHandler.connection, tx, this.txType, priorityFeeSetting, () => this.updateStatus(txName, TransactionStatus.Processing, attemptNum, undefined, true));
            this.updateStatus(txName, TransactionStatus.Successful, attemptNum, txSig ? bs58_1.default.encode(txSig) : undefined);
        }
        catch (e) {
            const errorDetails = (0, transactionUtils_1.getErrorInfo)(this.txHandler.umi, tx, e);
            const errorString = `${errorDetails.errorName ?? "Unknown error"}: ${errorDetails.errorInfo ?? "unknown"}`;
            this.updateStatus(txName, errorDetails.canBeIgnored
                ? TransactionStatus.Skipped
                : TransactionStatus.Failed, attemptNum, undefined, undefined, errorDetails.errorName || errorDetails.errorInfo
                ? errorString
                : e.message);
            this.txHandler.log(errorString);
            if (!errorDetails.canBeIgnored) {
                throw e;
            }
        }
    }
}
exports.TransactionsManager = TransactionsManager;
