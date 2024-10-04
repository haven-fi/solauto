"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJupSwapTransaction = getJupSwapTransaction;
const umi_1 = require("@metaplex-foundation/umi");
const web3_js_1 = require("@solana/web3.js");
const solanaUtils_1 = require("./solanaUtils");
const numberUtils_1 = require("./numberUtils");
const api_1 = require("@jup-ag/api");
const accountUtils_1 = require("./accountUtils");
const generalUtils_1 = require("./generalUtils");
const jupApi = (0, api_1.createJupiterApiClient)();
function createTransactionInstruction(instruction) {
    return new web3_js_1.TransactionInstruction({
        programId: new web3_js_1.PublicKey(instruction.programId),
        keys: instruction.accounts.map((key) => ({
            pubkey: new web3_js_1.PublicKey(key.pubkey),
            isSigner: key.isSigner,
            isWritable: key.isWritable,
        })),
        data: Buffer.from(instruction.data, "base64"),
    });
}
async function getJupSwapTransaction(signer, swapDetails, attemptNum) {
    console.log("Getting jup quote...");
    const quoteResponse = await (0, generalUtils_1.retryWithExponentialBackoff)(async () => await jupApi.quoteGet({
        amount: Number(swapDetails.amount),
        inputMint: swapDetails.inputMint.toString(),
        outputMint: swapDetails.outputMint.toString(),
        swapMode: swapDetails.exactOut
            ? "ExactOut"
            : swapDetails.exactIn
                ? "ExactIn"
                : undefined,
        slippageBps: 50,
        maxAccounts: !swapDetails.exactOut ? 60 : undefined,
    }), 3);
    const priceImpactBps = Math.round((0, numberUtils_1.toBps)(parseFloat(quoteResponse.priceImpactPct))) + 1;
    const finalPriceSlippageBps = Math.round(Math.max(50, quoteResponse.slippageBps, priceImpactBps) *
        (1 + (swapDetails.slippageIncFactor ?? 0)));
    quoteResponse.slippageBps = finalPriceSlippageBps;
    console.log(quoteResponse);
    if (swapDetails.exactOut) {
        console.log(quoteResponse.inAmount);
        quoteResponse.inAmount = (parseInt(quoteResponse.inAmount) +
            Math.ceil(parseInt(quoteResponse.inAmount) * (0, numberUtils_1.fromBps)(finalPriceSlippageBps))).toString();
        console.log(quoteResponse.inAmount);
    }
    console.log("Getting jup instructions...");
    const instructions = await jupApi.swapInstructionsPost({
        swapRequest: {
            userPublicKey: signer.publicKey.toString(),
            quoteResponse,
            wrapAndUnwrapSol: false,
            useTokenLedger: !swapDetails.exactOut && !swapDetails.exactIn,
            destinationTokenAccount: (0, accountUtils_1.getTokenAccount)(swapDetails.destinationWallet, swapDetails.outputMint).toString(),
        },
    });
    if (!instructions.swapInstruction) {
        throw new Error("No swap instruction was returned by Jupiter");
    }
    console.log("Raw price impact bps:", priceImpactBps);
    const finalPriceImpactBps = priceImpactBps * (1 + (swapDetails.slippageIncFactor ?? 0));
    console.log("Increased price impact bps:", finalPriceImpactBps);
    return {
        jupQuote: quoteResponse,
        priceImpactBps: finalPriceImpactBps,
        lookupTableAddresses: instructions.addressLookupTableAddresses,
        setupInstructions: (0, umi_1.transactionBuilder)().add(instructions.setupInstructions.map((ix) => (0, solanaUtils_1.getWrappedInstruction)(signer, createTransactionInstruction(ix)))),
        tokenLedgerIx: (0, umi_1.transactionBuilder)().add(instructions.tokenLedgerInstruction !== undefined
            ? (0, solanaUtils_1.getWrappedInstruction)(signer, createTransactionInstruction(instructions.tokenLedgerInstruction))
            : (0, umi_1.transactionBuilder)()),
        swapIx: (0, umi_1.transactionBuilder)().add((0, solanaUtils_1.getWrappedInstruction)(signer, createTransactionInstruction(instructions.swapInstruction))),
    };
}
