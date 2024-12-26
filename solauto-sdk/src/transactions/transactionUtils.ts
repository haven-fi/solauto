import {
  Instruction,
  ProgramError,
  Signer,
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
  InvalidRebalanceConditionError,
  LendingPlatform,
  SolautoAction,
  SolautoRebalanceType,
  TokenType,
  convertReferralFees,
  createSolautoProgram,
  getMarginfiProtocolInteractionInstructionDataSerializer,
  getMarginfiRebalanceInstructionDataSerializer,
  getSolautoErrorFromCode,
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
} from "../utils/generalUtils";
import { SolautoMarginfiClient } from "../clients/solautoMarginfiClient";
import {
  getMaxLiqUtilizationRateBps,
  uint8ArrayToBigInt,
} from "../utils/numberUtils";
import {
  eligibleForRebalance,
  positionStateWithLatestPrices,
} from "../utils/solauto/generalUtils";
import { getTokenAccount, getTokenAccountData } from "../utils/accountUtils";
import {
  createMarginfiProgram,
  getLendingAccountBorrowInstructionDataSerializer,
  getLendingAccountDepositInstructionDataSerializer,
  getLendingAccountRepayInstructionDataSerializer,
  getLendingAccountWithdrawInstructionDataSerializer,
  getMarginfiErrorFromCode,
  MARGINFI_PROGRAM_ID,
} from "../marginfi-sdk";
import { ReferralStateManager } from "../clients";
import {
  createJupiterProgram,
  getJupiterErrorFromCode,
  JUPITER_PROGRAM_ID,
} from "../jupiter-sdk";
import { PRICES } from "../constants";
import { TransactionItemInputs } from "../types";
import { safeGetPrice } from "../utils";

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
    client.referralStateData === null ||
    (client.referredBy !== undefined &&
      toWeb3JsPublicKey(client.referralStateData!.referredByState).equals(
        PublicKey.default
      )) ||
    (client.authorityLutAddress !== undefined &&
      toWeb3JsPublicKey(client.referralStateData!.lookupTable).equals(
        PublicKey.default
      ))
  ) {
    chores = chores.add(
      client.updateReferralStatesIx(undefined, client.authorityLutAddress)
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
        (client as SolautoMarginfiClient).marginfiAccountInitialize(
          (client as SolautoMarginfiClient).marginfiAccount as Signer
        )
      );
    }
    // TODO: PF
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
  const rebalanceInstructions = getRebalanceInstructions(client.umi, tx);
  if (rebalanceInstructions.length === 0) {
    return transactionBuilder();
  }

  const usesAccount = (key: PublicKey) =>
    tx
      .getInstructions()
      .some((t) => t.keys.some((k) => toWeb3JsPublicKey(k.pubkey).equals(key)));

  const checkReferralSupplyTa =
    client.referredBySupplyTa() && usesAccount(client.referredBySupplyTa()!);
  const checkReferralDebtTa =
    client.referredByDebtTa() && usesAccount(client.referredByDebtTa()!);
  const checkIntermediaryMfiAccount =
    client.lendingPlatform === LendingPlatform.Marginfi &&
    usesAccount(
      (client as SolautoMarginfiClient).intermediaryMarginfiAccountPk
    );
  const checkSignerSupplyTa = usesAccount(client.signerSupplyTa);
  const checkSignerDebtTa = usesAccount(client.signerDebtTa);

  const accountsNeeded = [
    ...[
      checkReferralSupplyTa ? client.referredBySupplyTa() : PublicKey.default,
    ],
    ...[checkReferralDebtTa ? client.referredByDebtTa() : PublicKey.default],
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
    referredByDebtTa,
    intermediaryMarginfiAccount,
    signerSupplyTa,
    signerDebtTa,
  ] = await client.umi.rpc.getAccounts(
    accountsNeeded.map((x) => publicKey(x ?? PublicKey.default))
  );

  let chores = transactionBuilder();

  if (checkReferralSupplyTa && !rpcAccountCreated(referredBySupplyTa)) {
    client.log("Creating referred-by supply TA");
    chores = chores.add(
      createAssociatedTokenAccountUmiIx(
        client.signer,
        client.referredByState!,
        client.supplyMint
      )
    );
  }

  if (checkReferralDebtTa && !rpcAccountCreated(referredByDebtTa)) {
    client.log("Creating referred-by debt TA");
    chores = chores.add(
      createAssociatedTokenAccountUmiIx(
        client.signer,
        client.referredByState!,
        client.debtMint
      )
    );
  }

  if (
    checkIntermediaryMfiAccount &&
    !rpcAccountCreated(intermediaryMarginfiAccount)
  ) {
    client.log("Creating intermediary marginfi account");
    chores = chores.add(
      (client as SolautoMarginfiClient).marginfiAccountInitialize(
        (client as SolautoMarginfiClient).intermediaryMarginfiAccountSigner!
      )
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

function getRebalanceInstructions(
  umi: Umi,
  tx: TransactionBuilder
): Instruction[] {
  return tx.getInstructions().filter((x) => {
    if (
      x.programId.toString() ===
      umi.programs.get("solauto").publicKey.toString()
    ) {
      try {
        const serializer = getMarginfiRebalanceInstructionDataSerializer();
        const discriminator = serializer.serialize({
          targetInAmountBaseUnit: 0,
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

function getSolautoActions(umi: Umi, tx: TransactionBuilder): SolautoAction[] {
  let solautoActions: SolautoAction[] = [];

  tx.getInstructions().forEach((x) => {
    if (
      x.programId.toString() ===
      umi.programs.get("solauto").publicKey.toString()
    ) {
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

    // TODO: PF
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

  const solautoActions = getSolautoActions(client.umi, tx);

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

export async function requiresRefreshBeforeRebalance(client: SolautoClient) {
  const neverRefreshedBefore =
    client.solautoPositionData &&
    client.solautoPositionData.state.supply.amountCanBeUsed.baseUnit ===
      BigInt(0) &&
    client.solautoPositionData.state.debt.amountCanBeUsed.baseUnit ===
      BigInt(0);
  const aboveMaxLtv =
    client.solautoPositionState!.liqUtilizationRateBps >
    getMaxLiqUtilizationRateBps(
      client.solautoPositionState!.maxLtvBps,
      client.solautoPositionState!.liqThresholdBps,
      0.01
    );

  if (aboveMaxLtv || neverRefreshedBefore) {
    return true;
  } else if (client.solautoPositionData && !client.selfManaged) {
    if (
      client.livePositionUpdates.supplyAdjustment > BigInt(0) ||
      client.livePositionUpdates.debtAdjustment > BigInt(0)
    ) {
      return false;
    }

    const oldStateWithLatestPrices = await positionStateWithLatestPrices(
      client.solautoPositionData.state,
      PRICES[client.supplyMint.toString()].price,
      PRICES[client.debtMint.toString()].price
    );
    const utilizationRateDiff = Math.abs(
      (client.solautoPositionState?.liqUtilizationRateBps ?? 0) -
        oldStateWithLatestPrices.liqUtilizationRateBps
    );

    client.log("Liq utilization rate diff:", utilizationRateDiff);
    if (
      client.livePositionUpdates.supplyAdjustment === BigInt(0) &&
      client.livePositionUpdates.debtAdjustment === BigInt(0) &&
      utilizationRateDiff >= 10
    ) {
      client.log("Choosing to refresh before rebalance. Utilization rate diff:", utilizationRateDiff);
      return true;
    }
  }

  // Rebalance ix will already refresh internally if position is self managed, has automation to update, or position state last updated >= 1 day ago

  client.log("Not refreshing before rebalance");
  return false;
}

export async function buildSolautoRebalanceTransaction(
  client: SolautoClient,
  targetLiqUtilizationRateBps?: number,
  attemptNum?: number
): Promise<TransactionItemInputs | undefined> {
  client.solautoPositionState = await client.getFreshPositionState();
  const supplyPrice = safeGetPrice(client.supplyMint) ?? 0;
  const debtPrice = safeGetPrice(client.debtMint) ?? 0;

  if (
    (client.solautoPositionState?.supply.amountUsed.baseUnit === BigInt(0) &&
      client.livePositionUpdates.supplyAdjustment === BigInt(0)) ||
    (targetLiqUtilizationRateBps === undefined &&
      !eligibleForRebalance(
        client.solautoPositionState!,
        client.solautoPositionSettings(),
        client.solautoPositionActiveDca(),
        currentUnixSeconds(),
        supplyPrice,
        debtPrice
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
    supplyPrice,
    debtPrice,
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

  if (await requiresRefreshBeforeRebalance(client)) {
    tx = tx.add(client.refresh());
  }

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
              jupQuote,
              rebalanceType,
              values,
              flashLoan,
              targetLiqUtilizationRateBps
            ),
          ]
        : []),
      swapIx,
      client.rebalance(
        "B",
        jupQuote,
        rebalanceType,
        values,
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
        jupQuote,
        rebalanceType,
        values,
        undefined,
        targetLiqUtilizationRateBps
      ),
      swapIx,
      client.rebalance(
        "B",
        jupQuote,
        rebalanceType,
        values,
        undefined,
        targetLiqUtilizationRateBps
      ),
    ]);
  }

  return {
    tx,
    lookupTableAddresses,
  };
}

export async function convertReferralFeesToDestination(
  referralManager: ReferralStateManager,
  tokenAccount: PublicKey,
  destinationMint: PublicKey
): Promise<TransactionItemInputs | undefined> {
  const tokenAccountData = await getTokenAccountData(
    referralManager.umi,
    tokenAccount
  );
  if (!tokenAccountData || tokenAccountData.amount === BigInt(0)) {
    return undefined;
  }

  const { lookupTableAddresses, setupInstructions, swapIx } =
    await getJupSwapTransaction(referralManager.umi.identity, {
      amount: tokenAccountData.amount,
      destinationWallet: referralManager.referralState,
      inputMint: tokenAccountData.mint,
      outputMint: destinationMint,
      exactIn: true,
      slippageIncFactor: 0.25,
    });

  let tx = transactionBuilder()
    .add(setupInstructions)
    .add(
      convertReferralFees(referralManager.umi, {
        signer: referralManager.umi.identity,
        intermediaryTa: publicKey(
          getTokenAccount(
            toWeb3JsPublicKey(referralManager.umi.identity.publicKey),
            tokenAccountData.mint
          )
        ),
        ixsSysvar: publicKey(SYSVAR_INSTRUCTIONS_PUBKEY),
        referralState: publicKey(referralManager.referralState),
        referralFeesTa: publicKey(tokenAccount),
      })
    )
    .add(swapIx);

  return { tx, lookupTableAddresses };
}

export function getErrorInfo(umi: Umi, tx: TransactionBuilder, error: any) {
  let canBeIgnored = false;
  let errorName: string | undefined = undefined;
  let errorInfo: string | undefined = undefined;

  try {
    let programError: ProgramError | null = null;

    if (typeof error === "object" && (error as any)["InstructionError"]) {
      const err = (error as any)["InstructionError"];
      const errIx = tx.getInstructions()[Math.max(0, err[0] - 2)]; // - 2 to account for computeUnitLimit and computeUnitPrice ixs at start
      const errCode =
        typeof err[1] === "object" && "Custom" in err[1]
          ? err[1]["Custom"]
          : undefined;
      const errName = errCode === undefined ? (err[1] as string) : undefined;
      let programName = "";

      if (
        errIx.programId.toString() ===
        umi.programs.get("solauto").publicKey.toString()
      ) {
        programError = getSolautoErrorFromCode(errCode, createSolautoProgram());
        programName = "Haven";
        if (
          programError?.name ===
          new InvalidRebalanceConditionError(createSolautoProgram()).name
        ) {
          canBeIgnored = true;
        }
      } else if (errIx.programId === MARGINFI_PROGRAM_ID) {
        programName = "Marginfi";
        programError = getMarginfiErrorFromCode(
          errCode,
          createMarginfiProgram()
        );
      } else if (errIx.programId === JUPITER_PROGRAM_ID) {
        programName = "Jupiter";
        programError = getJupiterErrorFromCode(errCode, createJupiterProgram());
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
  } catch {}

  return {
    errorName: errorName,
    errorInfo: errorInfo,
    canBeIgnored,
  };
}
