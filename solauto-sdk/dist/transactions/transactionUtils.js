"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rebalanceChoresBefore = rebalanceChoresBefore;
exports.getTransactionChores = getTransactionChores;
exports.requiresRefreshBeforeRebalance = requiresRefreshBeforeRebalance;
exports.buildSolautoRebalanceTransaction = buildSolautoRebalanceTransaction;
exports.convertReferralFeesToDestination = convertReferralFeesToDestination;
exports.getErrorInfo = getErrorInfo;
const umi_1 = require("@metaplex-foundation/umi");
const umi_web3js_adapters_1 = require("@metaplex-foundation/umi-web3js-adapters");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const generated_1 = require("../generated");
const solanaUtils_1 = require("../utils/solanaUtils");
const jupiterUtils_1 = require("../utils/jupiterUtils");
const rebalanceUtils_1 = require("../utils/solauto/rebalanceUtils");
const generalUtils_1 = require("../utils/generalUtils");
const numberUtils_1 = require("../utils/numberUtils");
const generalUtils_2 = require("../utils/solauto/generalUtils");
const accountUtils_1 = require("../utils/accountUtils");
const marginfi_sdk_1 = require("../marginfi-sdk");
const jupiter_sdk_1 = require("../jupiter-sdk");
const constants_1 = require("../constants");
function getWSolUsage(client, solautoActions, initiatingDcaIn, cancellingDcaIn) {
    const supplyIsWsol = client.supplyMint.equals(spl_token_1.NATIVE_MINT);
    const debtIsWsol = client.debtMint.equals(spl_token_1.NATIVE_MINT);
    if (!supplyIsWsol && !debtIsWsol) {
        return undefined;
    }
    const usingSupplyTaAction = solautoActions?.find((args) => (0, generated_1.isSolautoAction)("Deposit", args) || (0, generated_1.isSolautoAction)("Withdraw", args));
    const usingDebtTaAction = solautoActions?.find((args) => (0, generated_1.isSolautoAction)("Borrow", args) || (0, generated_1.isSolautoAction)("Repay", args));
    const dcaSupply = (initiatingDcaIn && initiatingDcaIn.tokenType === generated_1.TokenType.Supply) ||
        (cancellingDcaIn !== undefined && cancellingDcaIn === generated_1.TokenType.Supply);
    const dcaDebt = (initiatingDcaIn && initiatingDcaIn.tokenType === generated_1.TokenType.Debt) ||
        (cancellingDcaIn !== undefined && cancellingDcaIn === generated_1.TokenType.Debt);
    if (supplyIsWsol && (usingSupplyTaAction || dcaSupply)) {
        return {
            wSolTokenAccount: client.signerSupplyTa,
            solautoAction: usingSupplyTaAction,
        };
    }
    else if (debtIsWsol && (usingDebtTaAction || dcaDebt)) {
        return {
            wSolTokenAccount: client.signerDebtTa,
            solautoAction: usingDebtTaAction,
        };
    }
    else {
        return undefined;
    }
}
async function transactionChoresBefore(client, accountsGettingCreated, solautoActions, initiatingDcaIn) {
    let chores = (0, umi_1.transactionBuilder)();
    if (client.referralStateData === null ||
        (client.referredBy !== undefined &&
            client.referralStateData?.referredByState ===
                (0, umi_1.publicKey)(web3_js_1.PublicKey.default)) ||
        (client.authorityLutAddress !== undefined &&
            client.referralStateData.lookupTable == (0, umi_1.publicKey)(web3_js_1.PublicKey.default))) {
        chores = chores.add(client.updateReferralStatesIx(undefined, client.authorityLutAddress));
    }
    if (client.selfManaged) {
        if (client.solautoPositionData === null) {
            chores = chores.add(client.openPosition());
        }
        else if (client.lendingPlatform === generated_1.LendingPlatform.Marginfi &&
            !(await (0, generalUtils_1.getSolanaAccountCreated)(client.umi, client.marginfiAccountPk))) {
            chores = chores.add(client.marginfiAccountInitialize());
        }
        // TODO: PF
    }
    const wSolUsage = getWSolUsage(client, solautoActions, initiatingDcaIn, undefined);
    if (wSolUsage !== undefined) {
        if (await (0, generalUtils_1.getSolanaAccountCreated)(client.umi, wSolUsage.wSolTokenAccount)) {
            client.log(`Closing signer wSol TA`);
            chores = chores.add((0, solanaUtils_1.closeTokenAccountUmiIx)(client.signer, wSolUsage.wSolTokenAccount, (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(client.signer.publicKey)));
        }
        let amountToTransfer = BigInt(0);
        if (wSolUsage.solautoAction &&
            (0, generated_1.isSolautoAction)("Deposit", wSolUsage.solautoAction)) {
            amountToTransfer = BigInt(wSolUsage.solautoAction.fields[0]);
        }
        else if (wSolUsage.solautoAction &&
            (0, generated_1.isSolautoAction)("Repay", wSolUsage.solautoAction) &&
            wSolUsage.solautoAction.fields[0].__kind === "Some") {
            amountToTransfer = BigInt(wSolUsage.solautoAction.fields[0].fields[0]);
        }
        else if (initiatingDcaIn) {
            amountToTransfer = initiatingDcaIn.amount;
        }
        if (amountToTransfer > 0) {
            const amount = amountToTransfer +
                (await client.umi.rpc.getRent(spl_token_1.ACCOUNT_SIZE)).basisPoints;
            client.log(`Transferring ${amount} lamports to signer wSol TA`);
            chores = chores.add((0, solanaUtils_1.systemTransferUmiIx)(client.signer, wSolUsage.wSolTokenAccount, amount));
        }
        client.log("Creating signer wSol TA");
        chores = chores.add((0, solanaUtils_1.createAssociatedTokenAccountUmiIx)(client.signer, (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(client.signer.publicKey), spl_token_1.NATIVE_MINT));
        accountsGettingCreated.push(wSolUsage.wSolTokenAccount.toString());
    }
    for (const solautoAction of solautoActions ?? []) {
        if (!(0, generated_1.isSolautoAction)("Withdraw", solautoAction) &&
            !(0, generated_1.isSolautoAction)("Borrow", solautoAction)) {
            continue;
        }
        const tokenAccount = (0, generated_1.isSolautoAction)("Withdraw", solautoAction)
            ? client.signerSupplyTa
            : client.signerDebtTa;
        if (accountsGettingCreated.includes(tokenAccount.toString())) {
            continue;
        }
        if (!(0, generalUtils_1.getSolanaAccountCreated)(client.umi, tokenAccount)) {
            chores = chores.add((0, solanaUtils_1.createAssociatedTokenAccountUmiIx)(client.signer, (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(client.signer.publicKey), (0, generated_1.isSolautoAction)("Withdraw", solautoAction)
                ? client.supplyMint
                : client.debtMint));
            accountsGettingCreated.push(tokenAccount.toString());
        }
    }
    return chores;
}
async function rebalanceChoresBefore(client, tx, accountsGettingCreated) {
    const rebalanceInstructions = getRebalanceInstructions(client.umi, tx);
    if (rebalanceInstructions.length === 0) {
        return (0, umi_1.transactionBuilder)();
    }
    const usesAccount = (key) => tx
        .getInstructions()
        .some((t) => t.keys.some((k) => (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(k.pubkey).equals(key)));
    const checkReferralSupplyTa = client.referredBySupplyTa() && usesAccount(client.referredBySupplyTa());
    const checkReferralDebtTa = client.referredByDebtTa() && usesAccount(client.referredByDebtTa());
    const checkIntermediaryMfiAccount = client.lendingPlatform === generated_1.LendingPlatform.Marginfi &&
        usesAccount(client.intermediaryMarginfiAccountPk);
    const checkSignerSupplyTa = usesAccount(client.signerSupplyTa);
    const checkSignerDebtTa = usesAccount(client.signerDebtTa);
    const accountsNeeded = [
        ...[
            checkReferralSupplyTa ? client.referredBySupplyTa() : web3_js_1.PublicKey.default,
        ],
        ...[checkReferralDebtTa ? client.referredByDebtTa() : web3_js_1.PublicKey.default],
        ...[
            checkIntermediaryMfiAccount
                ? client.intermediaryMarginfiAccountPk
                : web3_js_1.PublicKey.default,
        ],
        ...[checkSignerSupplyTa ? client.signerSupplyTa : web3_js_1.PublicKey.default],
        ...[checkSignerDebtTa ? client.signerDebtTa : web3_js_1.PublicKey.default],
    ];
    const [referredBySupplyTa, referredByDebtTa, intermediaryMarginfiAccount, signerSupplyTa, signerDebtTa,] = await client.umi.rpc.getAccounts(accountsNeeded.map((x) => (0, umi_1.publicKey)(x ?? web3_js_1.PublicKey.default)));
    let chores = (0, umi_1.transactionBuilder)();
    if (checkReferralSupplyTa && !(0, generalUtils_1.rpcAccountCreated)(referredBySupplyTa)) {
        client.log("Creating referred-by supply TA");
        chores = chores.add((0, solanaUtils_1.createAssociatedTokenAccountUmiIx)(client.signer, client.referredByState, client.supplyMint));
    }
    if (checkReferralDebtTa && !(0, generalUtils_1.rpcAccountCreated)(referredByDebtTa)) {
        client.log("Creating referred-by debt TA");
        chores = chores.add((0, solanaUtils_1.createAssociatedTokenAccountUmiIx)(client.signer, client.referredByState, client.debtMint));
    }
    if (checkIntermediaryMfiAccount &&
        !(0, generalUtils_1.rpcAccountCreated)(intermediaryMarginfiAccount)) {
        client.log("Creating intermediary marginfi account");
        chores = chores.add(client.createIntermediaryMarginfiAccount());
    }
    if (checkSignerSupplyTa &&
        !(0, generalUtils_1.rpcAccountCreated)(signerSupplyTa) &&
        !accountsGettingCreated.includes(signerSupplyTa.publicKey.toString())) {
        client.log("Creating signer supply token account");
        chores = chores.add((0, solanaUtils_1.createAssociatedTokenAccountUmiIx)(client.signer, (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(client.signer.publicKey), client.supplyMint));
        accountsGettingCreated.push(signerSupplyTa.publicKey.toString());
    }
    if (checkSignerDebtTa &&
        !(0, generalUtils_1.rpcAccountCreated)(signerDebtTa) &&
        !accountsGettingCreated.includes(signerDebtTa.publicKey.toString())) {
        client.log("Creating signer debt token account");
        chores = chores.add((0, solanaUtils_1.createAssociatedTokenAccountUmiIx)(client.signer, (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(client.signer.publicKey), client.debtMint));
        accountsGettingCreated.push(signerDebtTa.publicKey.toString());
    }
    return chores;
}
function transactionChoresAfter(client, solautoActions, cancellingDcaIn) {
    let chores = (0, umi_1.transactionBuilder)();
    const wSolUsage = getWSolUsage(client, solautoActions, undefined, cancellingDcaIn);
    if (wSolUsage) {
        chores = chores.add((0, solanaUtils_1.closeTokenAccountUmiIx)(client.signer, wSolUsage.wSolTokenAccount, (0, umi_web3js_adapters_1.toWeb3JsPublicKey)(client.signer.publicKey)));
    }
    return chores;
}
function getRebalanceInstructions(umi, tx) {
    return tx.getInstructions().filter((x) => {
        if (x.programId.toString() ===
            umi.programs.get("solauto").publicKey.toString()) {
            try {
                const serializer = (0, generated_1.getMarginfiRebalanceInstructionDataSerializer)();
                const discriminator = serializer.serialize({
                    targetInAmountBaseUnit: 0,
                    rebalanceType: generated_1.SolautoRebalanceType.None,
                    targetLiqUtilizationRateBps: 0,
                })[0];
                const [data, _] = serializer.deserialize(x.data);
                if (data.discriminator === discriminator) {
                    return true;
                }
            }
            catch { }
            return false;
        }
    });
}
function getSolautoActions(umi, tx) {
    let solautoActions = [];
    tx.getInstructions().forEach((x) => {
        if (x.programId.toString() ===
            umi.programs.get("solauto").publicKey.toString()) {
            try {
                const serializer = (0, generated_1.getMarginfiProtocolInteractionInstructionDataSerializer)();
                const discriminator = serializer.serialize({
                    solautoAction: (0, generated_1.solautoAction)("Deposit", [BigInt(0)]),
                })[0];
                const [data, _] = serializer.deserialize(x.data);
                if (data.discriminator === discriminator) {
                    solautoActions?.push(data.solautoAction);
                }
            }
            catch { }
        }
        if (x.programId === marginfi_sdk_1.MARGINFI_PROGRAM_ID) {
            try {
                const serializer = (0, marginfi_sdk_1.getLendingAccountDepositInstructionDataSerializer)();
                const discriminator = (0, numberUtils_1.uint8ArrayToBigInt)(serializer
                    .serialize({
                    amount: 0,
                })
                    .slice(0, 8));
                const [data, _] = serializer.deserialize(x.data);
                if ((0, numberUtils_1.uint8ArrayToBigInt)(new Uint8Array(data.discriminator)) ===
                    discriminator) {
                    solautoActions?.push({
                        __kind: "Deposit",
                        fields: [data.amount],
                    });
                }
            }
            catch { }
            try {
                const serializer = (0, marginfi_sdk_1.getLendingAccountBorrowInstructionDataSerializer)();
                const discriminator = (0, numberUtils_1.uint8ArrayToBigInt)(serializer
                    .serialize({
                    amount: 0,
                })
                    .slice(0, 8));
                const [data, _] = serializer.deserialize(x.data);
                if ((0, numberUtils_1.uint8ArrayToBigInt)(new Uint8Array(data.discriminator)) ===
                    discriminator) {
                    solautoActions?.push({
                        __kind: "Borrow",
                        fields: [data.amount],
                    });
                }
            }
            catch { }
            try {
                const serializer = (0, marginfi_sdk_1.getLendingAccountWithdrawInstructionDataSerializer)();
                const discriminator = (0, numberUtils_1.uint8ArrayToBigInt)(serializer
                    .serialize({
                    amount: 0,
                    withdrawAll: false,
                })
                    .slice(0, 8));
                const [data, _] = serializer.deserialize(x.data);
                if ((0, numberUtils_1.uint8ArrayToBigInt)(new Uint8Array(data.discriminator)) ===
                    discriminator) {
                    solautoActions?.push({
                        __kind: "Withdraw",
                        fields: [
                            data.withdrawAll
                                ? {
                                    __kind: "All",
                                }
                                : {
                                    __kind: "Some",
                                    fields: [data.amount],
                                },
                        ],
                    });
                }
            }
            catch { }
            try {
                const serializer = (0, marginfi_sdk_1.getLendingAccountRepayInstructionDataSerializer)();
                const discriminator = (0, numberUtils_1.uint8ArrayToBigInt)(serializer
                    .serialize({
                    amount: 0,
                    repayAll: false,
                })
                    .slice(0, 8));
                const [data, _] = serializer.deserialize(x.data);
                if ((0, numberUtils_1.uint8ArrayToBigInt)(new Uint8Array(data.discriminator)) ===
                    discriminator) {
                    solautoActions?.push({
                        __kind: "Repay",
                        fields: [
                            data.repayAll
                                ? {
                                    __kind: "All",
                                }
                                : {
                                    __kind: "Some",
                                    fields: [data.amount],
                                },
                        ],
                    });
                }
            }
            catch { }
        }
        // TODO: PF
    });
    return solautoActions;
}
async function getTransactionChores(client, tx) {
    let choresBefore = (0, umi_1.transactionBuilder)();
    let choresAfter = (0, umi_1.transactionBuilder)();
    const accountsGettingCreated = [];
    const solautoActions = getSolautoActions(client.umi, tx);
    choresBefore = choresBefore.add([
        await transactionChoresBefore(client, accountsGettingCreated, solautoActions, client.livePositionUpdates.dcaInBalance),
        await rebalanceChoresBefore(client, tx, accountsGettingCreated),
    ]);
    choresAfter = choresAfter.add(transactionChoresAfter(client, solautoActions, client.livePositionUpdates.cancellingDca));
    return [choresBefore, choresAfter];
}
async function requiresRefreshBeforeRebalance(client) {
    if (client.solautoPositionState.liqUtilizationRateBps >
        (0, numberUtils_1.getMaxLiqUtilizationRateBps)(client.solautoPositionState.maxLtvBps, client.solautoPositionState.liqThresholdBps, 0.01)) {
        return true;
    }
    else if (client.solautoPositionData && !client.selfManaged) {
        if (client.livePositionUpdates.supplyAdjustment > BigInt(0) ||
            client.livePositionUpdates.debtAdjustment > BigInt(0)) {
            return false;
        }
        const oldStateWithLatestPrices = await (0, generalUtils_2.positionStateWithLatestPrices)(client.solautoPositionData.state, constants_1.PRICES[client.supplyMint.toString()].price, constants_1.PRICES[client.debtMint.toString()].price);
        const utilizationRateDiff = Math.abs((client.solautoPositionState?.liqUtilizationRateBps ?? 0) -
            oldStateWithLatestPrices.liqUtilizationRateBps);
        client.log("Liq utilization rate diff:", utilizationRateDiff);
        if (client.livePositionUpdates.supplyAdjustment === BigInt(0) &&
            client.livePositionUpdates.debtAdjustment === BigInt(0) &&
            utilizationRateDiff >= 10) {
            client.log("Choosing to refresh before rebalance");
            return true;
        }
    }
    // Rebalance ix will already refresh internally if position is self managed, has automation to update, or position state last updated >= 1 day ago
    client.log("Not refreshing before rebalance");
    return false;
}
async function buildSolautoRebalanceTransaction(client, targetLiqUtilizationRateBps, attemptNum) {
    client.solautoPositionState = await client.getFreshPositionState();
    if ((client.solautoPositionState?.supply.amountUsed.baseUnit === BigInt(0) &&
        client.livePositionUpdates.supplyAdjustment === BigInt(0)) ||
        (targetLiqUtilizationRateBps === undefined &&
            !(0, generalUtils_2.eligibleForRebalance)(client.solautoPositionState, client.solautoPositionSettings(), client.solautoPositionActiveDca(), (0, generalUtils_1.currentUnixSeconds)()))) {
        client.log("Not eligible for a rebalance");
        return undefined;
    }
    const values = (0, rebalanceUtils_1.getRebalanceValues)(client.solautoPositionState, client.solautoPositionSettings(), client.solautoPositionActiveDca(), (0, generalUtils_1.currentUnixSeconds)(), (0, generalUtils_1.safeGetPrice)(client.supplyMint), (0, generalUtils_1.safeGetPrice)(client.debtMint), targetLiqUtilizationRateBps);
    client.log("Rebalance values: ", values);
    const swapDetails = (0, rebalanceUtils_1.getJupSwapRebalanceDetails)(client, values, targetLiqUtilizationRateBps, attemptNum);
    const { jupQuote, lookupTableAddresses, setupInstructions, tokenLedgerIx, swapIx, } = await (0, jupiterUtils_1.getJupSwapTransaction)(client.signer, swapDetails, attemptNum);
    const flashLoan = (0, rebalanceUtils_1.getFlashLoanDetails)(client, values, jupQuote);
    let tx = (0, umi_1.transactionBuilder)();
    if (await requiresRefreshBeforeRebalance(client)) {
        tx = tx.add(client.refresh());
    }
    if (flashLoan) {
        client.log("Flash loan details: ", flashLoan);
        const addFirstRebalance = values.amountUsdToDcaIn > 0;
        const rebalanceType = addFirstRebalance
            ? generated_1.SolautoRebalanceType.DoubleRebalanceWithFL
            : generated_1.SolautoRebalanceType.SingleRebalanceWithFL;
        tx = tx.add([
            setupInstructions,
            tokenLedgerIx,
            client.flashBorrow(flashLoan, (0, accountUtils_1.getTokenAccount)((0, umi_web3js_adapters_1.toWeb3JsPublicKey)(client.signer.publicKey), swapDetails.inputMint)),
            ...(addFirstRebalance
                ? [
                    client.rebalance("A", jupQuote, rebalanceType, values, flashLoan, targetLiqUtilizationRateBps),
                ]
                : []),
            swapIx,
            client.rebalance("B", jupQuote, rebalanceType, values, flashLoan, targetLiqUtilizationRateBps),
            client.flashRepay(flashLoan),
        ]);
    }
    else {
        const rebalanceType = generated_1.SolautoRebalanceType.Regular;
        tx = tx.add([
            setupInstructions,
            tokenLedgerIx,
            client.rebalance("A", jupQuote, rebalanceType, values, undefined, targetLiqUtilizationRateBps),
            swapIx,
            client.rebalance("B", jupQuote, rebalanceType, values, undefined, targetLiqUtilizationRateBps),
        ]);
    }
    return {
        tx,
        lookupTableAddresses,
    };
}
async function convertReferralFeesToDestination(referralManager, tokenAccount, destinationMint) {
    const tokenAccountData = await (0, accountUtils_1.getTokenAccountData)(referralManager.umi, tokenAccount);
    if (!tokenAccountData || tokenAccountData.amount === BigInt(0)) {
        return undefined;
    }
    const { lookupTableAddresses, setupInstructions, swapIx } = await (0, jupiterUtils_1.getJupSwapTransaction)(referralManager.umi.identity, {
        amount: tokenAccountData.amount,
        destinationWallet: referralManager.referralState,
        inputMint: tokenAccountData.mint,
        outputMint: destinationMint,
        exactIn: true,
        slippageIncFactor: 0.25,
    });
    let tx = (0, umi_1.transactionBuilder)()
        .add(setupInstructions)
        .add((0, generated_1.convertReferralFees)(referralManager.umi, {
        signer: referralManager.umi.identity,
        intermediaryTa: (0, umi_1.publicKey)((0, accountUtils_1.getTokenAccount)((0, umi_web3js_adapters_1.toWeb3JsPublicKey)(referralManager.umi.identity.publicKey), tokenAccountData.mint)),
        ixsSysvar: (0, umi_1.publicKey)(web3_js_1.SYSVAR_INSTRUCTIONS_PUBKEY),
        referralState: (0, umi_1.publicKey)(referralManager.referralState),
        referralFeesTa: (0, umi_1.publicKey)(tokenAccount),
    }))
        .add(swapIx);
    return { tx, lookupTableAddresses };
}
function getErrorInfo(umi, tx, error) {
    let canBeIgnored = false;
    let errorName = undefined;
    let errorInfo = undefined;
    try {
        let programError = null;
        if (typeof error === "object" && error["InstructionError"]) {
            const err = error["InstructionError"];
            const errIx = tx.getInstructions()[Math.max(0, err[0])];
            const errCode = typeof err[1] === "object" && "Custom" in err[1] ? err[1]["Custom"] : undefined;
            const errName = errCode === undefined ? err[1] : undefined;
            let programName = "";
            if (errIx.programId.toString() ===
                umi.programs.get("solauto").publicKey.toString()) {
                programError = (0, generated_1.getSolautoErrorFromCode)(errCode, (0, generated_1.createSolautoProgram)());
                programName = "Haven";
                if (programError?.name ===
                    new generated_1.InvalidRebalanceConditionError((0, generated_1.createSolautoProgram)()).name) {
                    canBeIgnored = true;
                }
            }
            else if (errIx.programId === marginfi_sdk_1.MARGINFI_PROGRAM_ID) {
                programName = "Marginfi";
                programError = (0, marginfi_sdk_1.getMarginfiErrorFromCode)(errCode, (0, marginfi_sdk_1.createMarginfiProgram)());
            }
            else if (errIx.programId === jupiter_sdk_1.JUPITER_PROGRAM_ID) {
                programName = "Jupiter";
                programError = (0, jupiter_sdk_1.getJupiterErrorFromCode)(errCode, (0, jupiter_sdk_1.createJupiterProgram)());
            }
            if (errName && errCode === undefined) {
                errorName = `${programName ?? "Program"} error`;
                errorInfo = errName;
            }
        }
        if (programError) {
            errorName = programError?.name;
            errorInfo = programError?.message;
        }
    }
    catch { }
    return {
        errorName: errorName,
        errorInfo: errorInfo,
        canBeIgnored,
    };
}
