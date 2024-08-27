"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSolanaRpcConnection = getSolanaRpcConnection;
exports.currentUnixSecondsSolana = currentUnixSecondsSolana;
exports.getWrappedInstruction = getWrappedInstruction;
exports.setComputeUnitLimitUmiIx = setComputeUnitLimitUmiIx;
exports.setComputeUnitPriceUmiIx = setComputeUnitPriceUmiIx;
exports.createAssociatedTokenAccountUmiIx = createAssociatedTokenAccountUmiIx;
exports.systemTransferUmiIx = systemTransferUmiIx;
exports.closeTokenAccountUmiIx = closeTokenAccountUmiIx;
exports.splTokenTransferUmiIx = splTokenTransferUmiIx;
exports.getAdressLookupInputs = getAdressLookupInputs;
exports.assembleFinalTransaction = assembleFinalTransaction;
exports.getComputeUnitPriceEstimate = getComputeUnitPriceEstimate;
exports.sendSingleOptimizedTransaction = sendSingleOptimizedTransaction;
const bs58_1 = __importDefault(require("bs58"));
const umi_1 = require("@metaplex-foundation/umi");
const umi_web3js_adapters_1 = require("@metaplex-foundation/umi-web3js-adapters");
const umi_bundle_defaults_1 = require("@metaplex-foundation/umi-bundle-defaults");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const accountUtils_1 = require("./accountUtils");
const generalUtils_1 = require("./generalUtils");
const marginfi_sdk_1 = require("../marginfi-sdk");
const types_1 = require("../types");
function getSolanaRpcConnection(heliusApiKey) {
    const connection = new web3_js_1.Connection(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`, "finalized");
    const umi = (0, umi_bundle_defaults_1.createUmi)(connection);
    return [connection, umi];
}
async function currentUnixSecondsSolana(umi) {
    return await (0, generalUtils_1.retryWithExponentialBackoff)(async () => {
        const blockTime = await umi.rpc.getBlockTime(await umi.rpc.getSlot());
        if (blockTime === null) {
            throw new Error("Unable to retrieve block time");
        }
        return Number(blockTime);
    });
}
function getWrappedInstruction(signer, ix) {
    return {
        instruction: (0, umi_web3js_adapters_1.fromWeb3JsInstruction)(ix),
        signers: [signer],
        bytesCreatedOnChain: 0,
    };
}
function setComputeUnitLimitUmiIx(signer, maxComputeUnits) {
    return getWrappedInstruction(signer, web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({
        units: maxComputeUnits,
    }));
}
function setComputeUnitPriceUmiIx(signer, lamports) {
    return getWrappedInstruction(signer, web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: lamports,
    }));
}
function createAssociatedTokenAccountUmiIx(signer, wallet, mint) {
    return getWrappedInstruction(signer, (0, spl_token_1.createAssociatedTokenAccountIdempotentInstruction)((0, umi_web3js_adapters_1.toWeb3JsPublicKey)(signer.publicKey), (0, accountUtils_1.getTokenAccount)(wallet, mint), wallet, mint));
}
function systemTransferUmiIx(signer, destination, lamports) {
    return getWrappedInstruction(signer, web3_js_1.SystemProgram.transfer({
        fromPubkey: (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(signer.publicKey),
        toPubkey: destination,
        lamports,
    }));
}
function closeTokenAccountUmiIx(signer, tokenAccount, authority) {
    return getWrappedInstruction(signer, (0, spl_token_1.createCloseAccountInstruction)(tokenAccount, authority, authority));
}
function splTokenTransferUmiIx(signer, fromTa, toTa, authority, amount) {
    return getWrappedInstruction(signer, (0, spl_token_1.createTransferInstruction)(fromTa, toTa, authority, amount));
}
async function getAdressLookupInputs(umi, lookupTableAddresses) {
    const addressLookupTableAccountInfos = await umi.rpc.getAccounts(lookupTableAddresses.map((key) => (0, umi_1.publicKey)(key)));
    return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
        const addressLookupTableAddress = lookupTableAddresses[index];
        if (accountInfo.exists) {
            acc.push({
                publicKey: (0, umi_1.publicKey)(addressLookupTableAddress),
                addresses: web3_js_1.AddressLookupTableAccount.deserialize(accountInfo.data).addresses.map((x) => (0, umi_1.publicKey)(x)),
            });
        }
        return acc;
    }, new Array());
}
function assembleFinalTransaction(signer, tx, computeUnitPrice, computeUnitLimit) {
    tx = tx
        .prepend(setComputeUnitPriceUmiIx(signer, computeUnitPrice))
        .prepend(computeUnitLimit
        ? setComputeUnitLimitUmiIx(signer, computeUnitLimit)
        : (0, umi_1.transactionBuilder)());
    const marginfiStartFlSerializer = (0, marginfi_sdk_1.getLendingAccountStartFlashloanInstructionDataSerializer)();
    const marginfiStartFlDiscriminator = marginfiStartFlSerializer
        .serialize({
        endIndex: 0,
    })
        .slice(0, 8);
    const marginfiEndFlSerializer = (0, marginfi_sdk_1.getLendingAccountEndFlashloanInstructionDataSerializer)();
    const marginfiEndFlDiscriminator = marginfiEndFlSerializer
        .serialize({
        endIndex: 0,
    })
        .slice(0, 8);
    let endFlIndex = 0;
    const instructions = tx.getInstructions();
    for (let i = instructions.length - 1; i >= 0; i--) {
        const ix = instructions[i];
        try {
            const [data, _] = marginfiStartFlSerializer.deserialize(ix.data);
            if ((0, generalUtils_1.arraysAreEqual)(data.discriminator, Array.from(marginfiStartFlDiscriminator))) {
                ix.data = marginfiStartFlSerializer.serialize({
                    endIndex: endFlIndex,
                });
            }
        }
        catch { }
        try {
            const [data, _] = marginfiEndFlSerializer.deserialize(ix.data);
            if ((0, generalUtils_1.arraysAreEqual)(data.discriminator, Array.from(marginfiEndFlDiscriminator))) {
                endFlIndex = i;
            }
        }
        catch { }
    }
    return tx;
}
async function simulateTransaction(connection, transaction) {
    const simulationResult = await connection.simulateTransaction(transaction, {
        sigVerify: false,
        commitment: "processed"
    });
    if (simulationResult.value.err) {
        simulationResult.value.logs?.forEach((x) => {
            console.log(x);
        });
        throw simulationResult.value.err;
    }
    return simulationResult;
}
async function getComputeUnitPriceEstimate(umi, tx, prioritySetting) {
    const web3Transaction = (0, umi_web3js_adapters_1.toWeb3JsTransaction)((await tx.setLatestBlockhash(umi, { commitment: "finalized" })).build(umi));
    const serializedTransaction = bs58_1.default.encode(web3Transaction.serialize());
    const resp = await umi.rpc.call("getPriorityFeeEstimate", [
        {
            transaction: serializedTransaction,
            options: {
                priorityLevel: prioritySetting.toString(),
            },
        },
    ]);
    const feeEstimate = Math.round(resp.priorityFeeEstimate);
    return feeEstimate;
}
async function sendSingleOptimizedTransaction(umi, connection, tx, simulateOnly, attemptNum, prioritySetting = types_1.PriorityFeeSetting.Default) {
    console.log("Sending single optimized transaction...");
    console.log("Instructions: ", tx.getInstructions().length);
    console.log("Serialized transaction size: ", tx.getTransactionSize(umi));
    const feeEstimate = await getComputeUnitPriceEstimate(umi, tx, prioritySetting);
    console.log("Compute unit price: ", feeEstimate);
    const simulationResult = await (0, generalUtils_1.retryWithExponentialBackoff)(async () => await simulateTransaction(connection, (0, umi_web3js_adapters_1.toWeb3JsTransaction)(await (await assembleFinalTransaction(umi.identity, tx, feeEstimate, 1400000).setLatestBlockhash(umi)).build(umi))));
    const computeUnitLimit = Math.round(simulationResult.value.unitsConsumed * 1.1);
    console.log("Compute unit limit: ", computeUnitLimit);
    if (!simulateOnly) {
        const result = await assembleFinalTransaction(umi.identity, tx, feeEstimate, 800000).sendAndConfirm(umi, {
            send: {
                skipPreflight: true,
                commitment: "finalized",
            },
            confirm: { commitment: "finalized" },
        });
        console.log(`https://solscan.io/tx/${bs58_1.default.encode(result.signature)}`);
        if (result.result.value.err !== null) {
            throw new Error(result.result.value.err.toString());
        }
        return result.signature;
    }
    return undefined;
}
