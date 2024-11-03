"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildHeliusApiUrl = buildHeliusApiUrl;
exports.buildIronforgeApiUrl = buildIronforgeApiUrl;
exports.getSolanaRpcConnection = getSolanaRpcConnection;
exports.getWrappedInstruction = getWrappedInstruction;
exports.setComputeUnitLimitUmiIx = setComputeUnitLimitUmiIx;
exports.setComputeUnitPriceUmiIx = setComputeUnitPriceUmiIx;
exports.createAssociatedTokenAccountUmiIx = createAssociatedTokenAccountUmiIx;
exports.systemTransferUmiIx = systemTransferUmiIx;
exports.closeTokenAccountUmiIx = closeTokenAccountUmiIx;
exports.splTokenTransferUmiIx = splTokenTransferUmiIx;
exports.getAddressLookupInputs = getAddressLookupInputs;
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
const solauto_1 = require("./solauto");
const constants_1 = require("../constants");
function buildHeliusApiUrl(heliusApiKey) {
    return `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
}
function buildIronforgeApiUrl(ironforgeApiKey) {
    return `https://rpc.ironforge.network/mainnet?apiKey=${ironforgeApiKey}`;
}
function getSolanaRpcConnection(rpcUrl, programId = constants_1.SOLAUTO_PROD_PROGRAM) {
    const connection = new web3_js_1.Connection(rpcUrl, "confirmed");
    const umi = (0, umi_bundle_defaults_1.createUmi)(connection).use({
        install(umi) {
            umi.programs.add((0, solauto_1.createDynamicSolautoProgram)(programId), false);
        },
    });
    return [connection, umi];
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
async function getAddressLookupInputs(umi, lookupTableAddresses) {
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
function assembleFinalTransaction(signer, transaction, computeUnitPrice, computeUnitLimit) {
    let tx = (0, umi_1.transactionBuilder)()
        .prepend(computeUnitPrice !== undefined
        ? setComputeUnitPriceUmiIx(signer, computeUnitPrice)
        : (0, umi_1.transactionBuilder)())
        .prepend(computeUnitLimit
        ? setComputeUnitLimitUmiIx(signer, computeUnitLimit)
        : (0, umi_1.transactionBuilder)())
        .add(transaction);
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
        commitment: "processed",
    });
    if (simulationResult.value.err) {
        simulationResult.value.logs?.forEach((x) => {
            (0, generalUtils_1.consoleLog)(x);
        });
        throw simulationResult.value.err;
    }
    return simulationResult;
}
async function getComputeUnitPriceEstimate(umi, tx, prioritySetting) {
    const web3Transaction = (0, umi_web3js_adapters_1.toWeb3JsTransaction)((await tx.setLatestBlockhash(umi, { commitment: "finalized" })).build(umi));
    const serializedTransaction = bs58_1.default.encode(web3Transaction.serialize());
    let feeEstimate;
    try {
        const resp = await umi.rpc.call("getPriorityFeeEstimate", [
            {
                transaction: serializedTransaction,
                options: {
                    priorityLevel: prioritySetting.toString(),
                },
            },
        ]);
        feeEstimate = Math.round(resp.priorityFeeEstimate);
    }
    catch (e) {
        console.error(e);
    }
    return feeEstimate;
}
async function spamSendTransactionUntilConfirmed(connection, transaction, blockhash, spamInterval = 1000) {
    let transactionSignature = null;
    const sendTx = async () => {
        try {
            const txSignature = await connection.sendRawTransaction(Buffer.from(transaction.serialize()), { skipPreflight: true, maxRetries: 0 });
            transactionSignature = txSignature;
            (0, generalUtils_1.consoleLog)(`Transaction sent`);
        }
        catch (error) {
            (0, generalUtils_1.consoleLog)("Error sending transaction:", error);
        }
    };
    await sendTx();
    const sendIntervalId = setInterval(async () => {
        await sendTx();
    }, spamInterval);
    if (!transactionSignature) {
        throw new Error("Failed to send");
    }
    const resp = await connection
        .confirmTransaction({
        ...blockhash,
        signature: transactionSignature,
    })
        .finally(() => {
        clearInterval(sendIntervalId);
    });
    if (resp.value.err) {
        throw resp.value.err;
    }
    return transactionSignature;
}
async function sendSingleOptimizedTransaction(umi, connection, tx, txType, prioritySetting = types_1.PriorityFeeSetting.Min, onAwaitingSign) {
    (0, generalUtils_1.consoleLog)("Sending single optimized transaction...");
    (0, generalUtils_1.consoleLog)("Instructions: ", tx.getInstructions().length);
    (0, generalUtils_1.consoleLog)("Serialized transaction size: ", tx.getTransactionSize(umi));
    let cuPrice;
    if (prioritySetting !== types_1.PriorityFeeSetting.None) {
        cuPrice = await getComputeUnitPriceEstimate(umi, tx, prioritySetting);
        if (!cuPrice) {
            cuPrice = 1000000;
        }
        (0, generalUtils_1.consoleLog)("Compute unit price: ", cuPrice);
    }
    let computeUnitLimit = undefined;
    if (txType !== "skip-simulation") {
        // TODO: we should only retry simulation if it's not a solauto error
        const simulationResult = await (0, generalUtils_1.retryWithExponentialBackoff)(async () => await simulateTransaction(connection, (0, umi_web3js_adapters_1.toWeb3JsTransaction)(await (await assembleFinalTransaction(umi.identity, tx, cuPrice, 1400000).setLatestBlockhash(umi)).build(umi))), 3);
        simulationResult.value.err;
        computeUnitLimit = Math.round(simulationResult.value.unitsConsumed * 1.1);
        (0, generalUtils_1.consoleLog)("Compute unit limit: ", computeUnitLimit);
    }
    if (txType !== "only-simulate") {
        onAwaitingSign?.();
        // const result = await assembleFinalTransaction(
        //   umi.identity,
        //   tx,
        //   cuPrice,
        //   computeUnitLimit
        // ).sendAndConfirm(umi, {
        //   send: {
        //     skipPreflight: true,
        //     commitment: "confirmed",
        //     maxRetries: 0
        //   },
        //   confirm: { commitment: "confirmed" },
        // });
        // const txSig = bs58.encode(result.signature);
        const blockhash = await connection.getLatestBlockhash("confirmed");
        const signedTx = await assembleFinalTransaction(umi.identity, tx, cuPrice, computeUnitLimit)
            .setBlockhash(blockhash)
            .buildAndSign(umi);
        const txSig = await spamSendTransactionUntilConfirmed(connection, (0, umi_web3js_adapters_1.toWeb3JsTransaction)(signedTx), blockhash);
        (0, generalUtils_1.consoleLog)(`Transaction signature: ${txSig}`);
        (0, generalUtils_1.consoleLog)(`https://solscan.io/tx/${txSig}`);
        return bs58_1.default.decode(txSig);
    }
    return undefined;
}
