import {
  Instruction,
  TransactionBuilder,
  Umi,
  publicKey,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import {
  ACCOUNT_SIZE as TOKEN_ACCOUNT_SIZE,
  NATIVE_MINT,
} from "@solana/spl-token";
import {
  LendingPlatform,
  ReferralState,
  SOLAUTO_PROGRAM_ID,
  SolautoAction,
  SolautoRebalanceType,
  TokenType,
  convertReferralFees,
  getMarginfiProtocolInteractionInstructionDataSerializer,
  getMarginfiRebalanceInstructionDataSerializer,
  isSolautoAction,
  solautoAction,
} from "../generated";
import { SolautoClient } from "../clients/solautoClient";
import {
  closeTokenAccountUmiIx,
  createAssociatedTokenAccountUmiIx,
  systemTransferUmiIx,
} from "../utils/solanaUtils";
import { getJupSwapTransaction } from "../utils/jupiterUtils";
import {
  getFlashLoanDetails,
  getJupSwapRebalanceDetails,
  getRebalanceValues,
} from "../utils/solauto/rebalanceUtils";
import {
  currentUnixSeconds,
  getSolanaAccountCreated,
  rpcAccountCreated,
  safeGetPrice,
} from "../utils/generalUtils";
import { SolautoMarginfiClient } from "../clients/solautoMarginfiClient";
import {
  getMaxLiqUtilizationRateBps,
  uint8ArrayToBigInt,
} from "../utils/numberUtils";
import { eligibleForRebalance } from "../utils/solauto/generalUtils";
import { getTokenAccount, getTokenAccountData } from "../utils/accountUtils";
import {
  getLendingAccountBorrowInstructionDataSerializer,
  getLendingAccountDepositInstructionDataSerializer,
  getLendingAccountRepayInstructionDataSerializer,
  getLendingAccountWithdrawInstructionDataSerializer,
  MARGINFI_PROGRAM_ID,
} from "../marginfi-sdk";

interface wSolTokenUsage {
  wSolTokenAccount: PublicKey;
  solautoAction?: SolautoAction;
}

function getWSolUsage(
  client: SolautoClient,
  solautoActions?: SolautoAction[],
  initiatingDcaIn?: {
    amount: bigint;
    tokenType: TokenType;
  },
  cancellingDcaIn?: TokenType
): wSolTokenUsage | undefined {
  const supplyIsWsol = client.supplyMint.equals(NATIVE_MINT);
  const debtIsWsol = client.debtMint.equals(NATIVE_MINT);
  if (!supplyIsWsol && !debtIsWsol) {
    return undefined;
  }

  const usingSupplyTaAction = solautoActions?.find(
    (args) =>
      isSolautoAction("Deposit", args) || isSolautoAction("Withdraw", args)
  );
  const usingDebtTaAction = solautoActions?.find(
    (args) => isSolautoAction("Borrow", args) || isSolautoAction("Repay", args)
  );

  const dcaSupply =
    (initiatingDcaIn && initiatingDcaIn.tokenType === TokenType.Supply) ||
    (cancellingDcaIn !== undefined && cancellingDcaIn === TokenType.Supply);

  const dcaDebt =
    (initiatingDcaIn && initiatingDcaIn.tokenType === TokenType.Debt) ||
    (cancellingDcaIn !== undefined && cancellingDcaIn === TokenType.Debt);

  if (supplyIsWsol && (usingSupplyTaAction || dcaSupply)) {
    return {
      wSolTokenAccount: client.signerSupplyTa,
      solautoAction: usingSupplyTaAction,
    };
  } else if (debtIsWsol && (usingDebtTaAction || dcaDebt)) {
    return {
      wSolTokenAccount: client.signerDebtTa,
      solautoAction: usingDebtTaAction,
    };
  } else {
    return undefined;
  }
}

async function transactionChoresBefore(
  client: SolautoClient,
  accountsGettingCreated: string[],
  solautoActions?: SolautoAction[],
  initiatingDcaIn?: {
    amount: bigint;
    tokenType: TokenType;
  }
): Promise<TransactionBuilder> {
  let chores = transactionBuilder();

  if (
    client.referralStateManager.referralStateData === null ||
    (client.referredByState !== undefined &&
      client.referralStateManager.referralStateData?.referredByState ===
        publicKey(PublicKey.default)) ||
    (client.authorityLutAddress !== undefined &&
      client.referralStateManager.referralStateData!.lookupTable ==
        publicKey(PublicKey.default))
  ) {
    chores = chores.add(
      client.referralStateManager.updateReferralStatesIx(
        undefined,
        client.referredByAuthority,
        client.authorityLutAddress
      )
    );
  }

  if (client.selfManaged) {
    if (client.solautoPositionData === null) {
      chores = chores.add(client.openPosition());
    } else if (
      client.lendingPlatform === LendingPlatform.Marginfi &&
      !(await getSolanaAccountCreated(
        client.umi,
        (client as SolautoMarginfiClient).marginfiAccountPk
      ))
    ) {
      chores = chores.add(
        (client as SolautoMarginfiClient).marginfiAccountInitialize()
      );
    }
    // TODO: support other platforms
  }

  const wSolUsage = getWSolUsage(
    client,
    solautoActions,
    initiatingDcaIn,
    undefined
  );
  if (wSolUsage !== undefined) {
    if (await getSolanaAccountCreated(client.umi, wSolUsage.wSolTokenAccount)) {
      client.log(`Closing signer wSol TA`);
      chores = chores.add(
        closeTokenAccountUmiIx(
          client.signer,
          wSolUsage.wSolTokenAccount,
          toWeb3JsPublicKey(client.signer.publicKey)
        )
      );
    }

    let amountToTransfer = BigInt(0);
    if (
      wSolUsage.solautoAction &&
      isSolautoAction("Deposit", wSolUsage.solautoAction)
    ) {
      amountToTransfer = BigInt(wSolUsage.solautoAction.fields[0]);
    } else if (
      wSolUsage.solautoAction &&
      isSolautoAction("Repay", wSolUsage.solautoAction) &&
      wSolUsage.solautoAction.fields[0].__kind === "Some"
    ) {
      amountToTransfer = BigInt(wSolUsage.solautoAction.fields[0].fields[0]);
    } else if (initiatingDcaIn) {
      amountToTransfer = initiatingDcaIn.amount;
    }

    if (amountToTransfer > 0) {
      const amount =
        amountToTransfer +
        (await client.umi.rpc.getRent(TOKEN_ACCOUNT_SIZE)).basisPoints;
      client.log(`Transferring ${amount} lamports to signer wSol TA`);
      chores = chores.add(
        systemTransferUmiIx(client.signer, wSolUsage.wSolTokenAccount, amount)
      );
    }

    client.log("Creating signer wSol TA");
    chores = chores.add(
      createAssociatedTokenAccountUmiIx(
        client.signer,
        toWeb3JsPublicKey(client.signer.publicKey),
        NATIVE_MINT
      )
    );
    accountsGettingCreated.push(wSolUsage.wSolTokenAccount.toString());
  }

  for (const solautoAction of solautoActions ?? []) {
    if (
      !isSolautoAction("Withdraw", solautoAction) &&
      !isSolautoAction("Borrow", solautoAction)
    ) {
      continue;
    }

    const tokenAccount = isSolautoAction("Withdraw", solautoAction)
      ? client.signerSupplyTa
      : client.signerDebtTa;
    if (accountsGettingCreated.includes(tokenAccount.toString())) {
      continue;
    }

    if (!getSolanaAccountCreated(client.umi, tokenAccount)) {
      chores = chores.add(
        createAssociatedTokenAccountUmiIx(
          client.signer,
          toWeb3JsPublicKey(client.signer.publicKey),
          isSolautoAction("Withdraw", solautoAction)
            ? client.supplyMint
            : client.debtMint
        )
      );
      accountsGettingCreated.push(tokenAccount.toString());
    }
  }

  return chores;
}

export async function rebalanceChoresBefore(
  client: SolautoClient,
  tx: TransactionBuilder,
  accountsGettingCreated: string[]
): Promise<TransactionBuilder> {
  const rebalanceInstructions = getRebalanceInstructions(tx);
  if (rebalanceInstructions.length === 0) {
    return transactionBuilder();
  }

  const usesAccount = (key: PublicKey) =>
    tx
      .getInstructions()
      .some((t) => t.keys.some((k) => toWeb3JsPublicKey(k.pubkey).equals(key)));

  const checkReferralSupplyTa =
    client.referredBySupplyTa && usesAccount(client.referredBySupplyTa);
  const checkSolautoFeesTa = usesAccount(client.solautoFeesSupplyTa);
  const checkIntermediaryMfiAccount =
    client.lendingPlatform === LendingPlatform.Marginfi &&
    usesAccount(
      (client as SolautoMarginfiClient).intermediaryMarginfiAccountPk
    );
  const checkSignerSupplyTa = usesAccount(client.signerSupplyTa);
  const checkSignerDebtTa = usesAccount(client.signerDebtTa);

  const accountsNeeded = [
    ...[checkReferralSupplyTa ? client.referredBySupplyTa : PublicKey.default],
    ...[checkSolautoFeesTa ? client.solautoFeesSupplyTa : PublicKey.default],
    ...[
      checkIntermediaryMfiAccount
        ? (client as SolautoMarginfiClient).intermediaryMarginfiAccountPk
        : PublicKey.default,
    ],
    ...[checkSignerSupplyTa ? client.signerSupplyTa : PublicKey.default],
    ...[checkSignerDebtTa ? client.signerDebtTa : PublicKey.default],
  ];

  const [
    referredBySupplyTa,
    solautoFeesSupplyTa,
    intermediaryMarginfiAccount,
    signerSupplyTa,
    signerDebtTa,
  ] = await client.umi.rpc.getAccounts(
    accountsNeeded.map((x) => publicKey(x ?? PublicKey.default))
  );

  let chores = transactionBuilder();

  if (checkReferralSupplyTa && !rpcAccountCreated(referredBySupplyTa)) {
    client.log("Creating referred-by TA for ", client.supplyMint.toString());
    chores = chores.add(
      createAssociatedTokenAccountUmiIx(
        client.signer,
        client.referredByState!,
        client.supplyMint
      )
    );
  }

  if (checkSolautoFeesTa && !rpcAccountCreated(solautoFeesSupplyTa)) {
    client.log("Creating Solauto fees TA for ", client.supplyMint.toString());
    chores = chores.add(
      createAssociatedTokenAccountUmiIx(
        client.signer,
        client.solautoFeesWallet,
        client.supplyMint
      )
    );
  }

  if (
    checkIntermediaryMfiAccount &&
    !rpcAccountCreated(intermediaryMarginfiAccount)
  ) {
    client.log("Creating intermediary marginfi account");
    chores = chores.add(
      (client as SolautoMarginfiClient).createIntermediaryMarginfiAccount()
    );
  }

  if (
    checkSignerSupplyTa &&
    !rpcAccountCreated(signerSupplyTa) &&
    !accountsGettingCreated.includes(signerSupplyTa.publicKey.toString())
  ) {
    client.log("Creating signer supply token account");
    chores = chores.add(
      createAssociatedTokenAccountUmiIx(
        client.signer,
        toWeb3JsPublicKey(client.signer.publicKey),
        client.supplyMint
      )
    );
    accountsGettingCreated.push(signerSupplyTa.publicKey.toString());
  }

  if (
    checkSignerDebtTa &&
    !rpcAccountCreated(signerDebtTa) &&
    !accountsGettingCreated.includes(signerDebtTa.publicKey.toString())
  ) {
    client.log("Creating signer debt token account");
    chores = chores.add(
      createAssociatedTokenAccountUmiIx(
        client.signer,
        toWeb3JsPublicKey(client.signer.publicKey),
        client.debtMint
      )
    );
    accountsGettingCreated.push(signerDebtTa.publicKey.toString());
  }

  return chores;
}

function transactionChoresAfter(
  client: SolautoClient,
  solautoActions?: SolautoAction[],
  cancellingDcaIn?: TokenType
): TransactionBuilder {
  let chores = transactionBuilder();

  const wSolUsage = getWSolUsage(
    client,
    solautoActions,
    undefined,
    cancellingDcaIn
  );
  if (wSolUsage) {
    chores = chores.add(
      closeTokenAccountUmiIx(
        client.signer,
        wSolUsage.wSolTokenAccount,
        toWeb3JsPublicKey(client.signer.publicKey)
      )
    );
  }

  return chores;
}

function getRebalanceInstructions(tx: TransactionBuilder): Instruction[] {
  return tx.getInstructions().filter((x) => {
    if (x.programId === SOLAUTO_PROGRAM_ID) {
      try {
        const serializer = getMarginfiRebalanceInstructionDataSerializer();
        const discriminator = serializer.serialize({
          slippageBps: 0,
          limitGapBps: 0,
          rebalanceType: SolautoRebalanceType.None,
          targetLiqUtilizationRateBps: 0,
        })[0];
        const [data, _] = serializer.deserialize(x.data);
        if (data.discriminator === discriminator) {
          return true;
        }
      } catch {}
      return false;
    }
  });
}

function getSolautoActions(tx: TransactionBuilder): SolautoAction[] {
  let solautoActions: SolautoAction[] = [];

  tx.getInstructions().forEach((x) => {
    if (x.programId === SOLAUTO_PROGRAM_ID) {
      try {
        const serializer =
          getMarginfiProtocolInteractionInstructionDataSerializer();
        const discriminator = serializer.serialize({
          solautoAction: solautoAction("Deposit", [BigInt(0)]),
        })[0];
        const [data, _] = serializer.deserialize(x.data);
        if (data.discriminator === discriminator) {
          solautoActions?.push(data.solautoAction);
        }
      } catch {}
    }

    if (x.programId === MARGINFI_PROGRAM_ID) {
      try {
        const serializer = getLendingAccountDepositInstructionDataSerializer();
        const discriminator = uint8ArrayToBigInt(
          serializer
            .serialize({
              amount: 0,
            })
            .slice(0, 8)
        );
        const [data, _] = serializer.deserialize(x.data);
        if (
          uint8ArrayToBigInt(new Uint8Array(data.discriminator)) ===
          discriminator
        ) {
          solautoActions?.push({
            __kind: "Deposit",
            fields: [data.amount],
          });
        }
      } catch {}

      try {
        const serializer = getLendingAccountBorrowInstructionDataSerializer();
        const discriminator = uint8ArrayToBigInt(
          serializer
            .serialize({
              amount: 0,
            })
            .slice(0, 8)
        );
        const [data, _] = serializer.deserialize(x.data);
        if (
          uint8ArrayToBigInt(new Uint8Array(data.discriminator)) ===
          discriminator
        ) {
          solautoActions?.push({
            __kind: "Borrow",
            fields: [data.amount],
          });
        }
      } catch {}

      try {
        const serializer = getLendingAccountWithdrawInstructionDataSerializer();
        const discriminator = uint8ArrayToBigInt(
          serializer
            .serialize({
              amount: 0,
              withdrawAll: false,
            })
            .slice(0, 8)
        );
        const [data, _] = serializer.deserialize(x.data);
        if (
          uint8ArrayToBigInt(new Uint8Array(data.discriminator)) ===
          discriminator
        ) {
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
      } catch {}

      try {
        const serializer = getLendingAccountRepayInstructionDataSerializer();
        const discriminator = uint8ArrayToBigInt(
          serializer
            .serialize({
              amount: 0,
              repayAll: false,
            })
            .slice(0, 8)
        );
        const [data, _] = serializer.deserialize(x.data);
        if (
          uint8ArrayToBigInt(new Uint8Array(data.discriminator)) ===
          discriminator
        ) {
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
      } catch {}
    }

    // TODO support other platforms
  });

  return solautoActions;
}

export async function getTransactionChores(
  client: SolautoClient,
  tx: TransactionBuilder
): Promise<[TransactionBuilder, TransactionBuilder]> {
  let choresBefore = transactionBuilder();
  let choresAfter = transactionBuilder();
  const accountsGettingCreated: string[] = [];

  const solautoActions = getSolautoActions(tx);

  choresBefore = choresBefore.add([
    await transactionChoresBefore(
      client,
      accountsGettingCreated,
      solautoActions,
      client.livePositionUpdates.dcaInBalance
    ),
    await rebalanceChoresBefore(client, tx, accountsGettingCreated),
  ]);

  choresAfter = choresAfter.add(
    transactionChoresAfter(
      client,
      solautoActions,
      client.livePositionUpdates.cancellingDca
    )
  );

  return [choresBefore, choresAfter];
}

export async function buildSolautoRebalanceTransaction(
  client: SolautoClient,
  targetLiqUtilizationRateBps?: number,
  attemptNum?: number
): Promise<
  | {
      tx: TransactionBuilder;
      lookupTableAddresses: string[];
    }
  | undefined
> {
  client.solautoPositionState = await client.getFreshPositionState();
  if (
    client.solautoPositionState?.supply.amountUsed.baseUnit === BigInt(0) ||
    (targetLiqUtilizationRateBps === undefined &&
      !eligibleForRebalance(
        client.solautoPositionState!,
        client.solautoPositionSettings()!,
        client.solautoPositionActiveDca()!,
        currentUnixSeconds()
      ))
  ) {
    client.log("Not eligible for a rebalance");
    return undefined;
  }

  const values = getRebalanceValues(
    client.solautoPositionState!,
    client.solautoPositionSettings(),
    client.solautoPositionActiveDca(),
    currentUnixSeconds(),
    safeGetPrice(client.supplyMint)!,
    safeGetPrice(client.debtMint)!,
    targetLiqUtilizationRateBps
  );
  client.log("Rebalance values: ", values);

  const swapDetails = getJupSwapRebalanceDetails(
    client,
    values,
    targetLiqUtilizationRateBps,
    attemptNum
  );
  const {
    jupQuote,
    lookupTableAddresses,
    setupInstructions,
    tokenLedgerIx,
    swapIx,
  } = await getJupSwapTransaction(client.signer, swapDetails, attemptNum);
  const flashLoan = getFlashLoanDetails(client, values, jupQuote);

  let tx = transactionBuilder();

  if (flashLoan) {
    client.log("Flash loan details: ", flashLoan);
    const addFirstRebalance = values.amountUsdToDcaIn > 0;
    const rebalanceType = addFirstRebalance
      ? SolautoRebalanceType.DoubleRebalanceWithFL
      : SolautoRebalanceType.SingleRebalanceWithFL;

    tx = tx.add([
      setupInstructions,
      tokenLedgerIx,
      client.flashBorrow(
        flashLoan,
        getTokenAccount(
          toWeb3JsPublicKey(client.signer.publicKey),
          swapDetails.inputMint
        )
      ),
      ...(addFirstRebalance
        ? [
            client.rebalance(
              "A",
              swapDetails,
              rebalanceType,
              jupQuote.slippageBps,
              flashLoan,
              targetLiqUtilizationRateBps
            ),
          ]
        : []),
      swapIx,
      client.rebalance(
        "B",
        swapDetails,
        rebalanceType,
        jupQuote.slippageBps,
        flashLoan,
        targetLiqUtilizationRateBps
      ),
      client.flashRepay(flashLoan),
    ]);
  } else {
    const rebalanceType = SolautoRebalanceType.Regular;
    tx = tx.add([
      setupInstructions,
      tokenLedgerIx,
      client.rebalance(
        "A",
        swapDetails,
        rebalanceType,
        jupQuote.slippageBps,
        undefined,
        targetLiqUtilizationRateBps
      ),
      swapIx,
      client.rebalance(
        "B",
        swapDetails,
        rebalanceType,
        jupQuote.slippageBps,
        undefined,
        targetLiqUtilizationRateBps
      ),
    ]);
  }

  if (
    client.solautoPositionState!.liqUtilizationRateBps >
    getMaxLiqUtilizationRateBps(
      client.solautoPositionState!.maxLtvBps,
      client.solautoPositionState!.liqThresholdBps,
      0.01
    )
  ) {
    tx = tx.prepend(client.refresh());
  }

  return {
    tx,
    lookupTableAddresses,
  };
}

export async function convertReferralFeesToDestination(
  umi: Umi,
  referralState: ReferralState,
  tokenAccount: PublicKey
): Promise<[TransactionBuilder, string[]] | undefined> {
  const tokenAccountData = await getTokenAccountData(umi, tokenAccount);
  if (!tokenAccountData || tokenAccountData.amount === BigInt(0)) {
    return undefined;
  }

  const { lookupTableAddresses, setupInstructions, swapIx } =
    await getJupSwapTransaction(umi.identity, {
      amount: tokenAccountData.amount,
      destinationWallet: toWeb3JsPublicKey(referralState.publicKey),
      inputMint: tokenAccountData.mint,
      outputMint: toWeb3JsPublicKey(referralState.destFeesMint),
      exactIn: true,
      slippageBpsIncFactor: 0.15,
    });

  let tx = transactionBuilder()
    .add(setupInstructions)
    .add(
      convertReferralFees(umi, {
        signer: umi.identity,
        intermediaryTa: publicKey(
          getTokenAccount(
            toWeb3JsPublicKey(umi.identity.publicKey),
            tokenAccountData.mint
          )
        ),
        ixsSysvar: publicKey(SYSVAR_INSTRUCTIONS_PUBKEY),
        referralState: referralState.publicKey,
        referralFeesTa: publicKey(tokenAccount),
      })
    )
    .add(swapIx);

  return [tx, lookupTableAddresses];
}
