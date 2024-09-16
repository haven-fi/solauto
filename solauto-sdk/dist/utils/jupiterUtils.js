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
        slippageBps: 10,
        maxAccounts: !swapDetails.exactOut ? 60 : undefined,
    }), 3);
    const finalPriceSlippageBps = Math.round(Math.max(50, quoteResponse.slippageBps, Math.round((0, numberUtils_1.toBps)(parseFloat(quoteResponse.priceImpactPct))) + 1) *
        (1 + (swapDetails.slippageBpsIncFactor ?? 0)));
    quoteResponse.slippageBps = finalPriceSlippageBps;
    console.log(quoteResponse);
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
    return {
        jupQuote: quoteResponse,
        lookupTableAddresses: instructions.addressLookupTableAddresses,
        setupInstructions: (0, umi_1.transactionBuilder)().add(instructions.setupInstructions.map((ix) => (0, solanaUtils_1.getWrappedInstruction)(signer, createTransactionInstruction(ix)))),
        tokenLedgerIx: (0, umi_1.transactionBuilder)().add(instructions.tokenLedgerInstruction !== undefined
            ? (0, solanaUtils_1.getWrappedInstruction)(signer, createTransactionInstruction(instructions.tokenLedgerInstruction))
            : (0, umi_1.transactionBuilder)()),
        swapIx: (0, umi_1.transactionBuilder)().add((0, solanaUtils_1.getWrappedInstruction)(signer, createTransactionInstruction(instructions.swapInstruction))),
    };
}
