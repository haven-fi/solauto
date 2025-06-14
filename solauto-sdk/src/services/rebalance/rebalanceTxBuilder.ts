import { PublicKey } from "@solana/web3.js";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { transactionBuilder } from "@metaplex-foundation/umi";
import { SolautoClient } from "../solauto";
import {
  FlashLoanRequirements,
  RebalanceDetails,
  TransactionItemInputs,
} from "../../types";
import {
  bytesToI80F48,
  consoleLog,
  fromBaseUnit,
  fromBps,
  getMaxLiqUtilizationRateBps,
  getTokenAccount,
  hasFirstRebalance,
  hasLastRebalance,
  isMarginfiPosition,
  safeGetPrice,
  tokenInfo,
} from "../../utils";
import {
  PositionTokenState,
  PriceType,
  RebalanceDirection,
  RebalanceStep,
  SolautoRebalanceType,
  SwapType,
  TokenBalanceChangeType,
  TokenType,
} from "../../generated";
import {
  applyDebtAdjustmentUsd,
  getRebalanceValues,
  RebalanceValues,
} from "./rebalanceValues";
import { SolautoFeesBps } from "./solautoFees";
import { RebalanceSwapManager } from "./rebalanceSwapManager";

export class RebalanceTxBuilder {
  private values!: RebalanceValues;
  private rebalanceType!: SolautoRebalanceType;
  private swapManager!: RebalanceSwapManager;
  private flRequirements?: FlashLoanRequirements;
  private priceType: PriceType = PriceType.Realtime;

  constructor(
    private client: SolautoClient,
    private targetLiqUtilizationRateBps?: number,
    private optimizeSize?: boolean,
    private bpsDistanceFromRebalance?: number
  ) {}

  private shouldProceedWithRebalance() {
    if (this.client.pos.selfManaged && this.targetLiqUtilizationRateBps === undefined) {
      throw new Error(
        "A target rate must be provided for self managed position rebalances"
      );
    }

    return (
      this.client.pos.supplyUsd() > 0 &&
      (this.targetLiqUtilizationRateBps !== undefined ||
        this.client.pos.eligibleForRebalance(this.bpsDistanceFromRebalance))
    );
  }

  private getRebalanceValues() {
    return getRebalanceValues(
      this.client.pos,
      this.priceType,
      this.targetLiqUtilizationRateBps,
      SolautoFeesBps.create(
        this.client.isReferred,
        this.targetLiqUtilizationRateBps,
        this.client.pos.netWorthUsd(this.priceType)
      ),
      this.flRequirements?.flFeeBps ?? 0,
      this.bpsDistanceFromRebalance
    );
  }

  private getFlLiquiditySource(
    attemptNum: number,
    supplyLiquidityAvailable: bigint,
    debtLiquidityAvailable: bigint
  ): TokenType | undefined {
    const debtAdjustmentUsd = Math.abs(this.values.debtAdjustmentUsd);

    const calcLiquidityAvailable = (
      liquidityAvailable: bigint,
      tokenMint: PublicKey
    ) =>
      fromBaseUnit(liquidityAvailable, tokenInfo(tokenMint).decimals) *
      (safeGetPrice(tokenMint) ?? 0);

    const supplyLiquidityUsdAvailable = calcLiquidityAvailable(
      supplyLiquidityAvailable,
      this.client.pos.supplyMint
    );
    const insufficientSupplyLiquidity =
      debtAdjustmentUsd > supplyLiquidityUsdAvailable * 0.95;

    const debtLiquidityUsdAvailable = calcLiquidityAvailable(
      debtLiquidityAvailable,
      this.client.pos.debtMint
    );
    const insufficientDebtLiquidity =
      debtAdjustmentUsd > debtLiquidityUsdAvailable * 0.95;

    let useDebtLiquidity =
      this.values.rebalanceDirection === RebalanceDirection.Boost ||
      insufficientSupplyLiquidity ||
      (attemptNum > 2 &&
        debtLiquidityUsdAvailable > supplyLiquidityUsdAvailable * 5);

    if (useDebtLiquidity) {
      return !insufficientDebtLiquidity ? TokenType.Debt : undefined;
    } else {
      return !insufficientSupplyLiquidity ? TokenType.Supply : undefined;
    }
  }

  private intermediaryLiqUtilizationRateBps() {
    if (
      this.client.pos.maxLtvPriceType !== PriceType.Ema ||
      this.priceType === PriceType.Ema ||
      this.values.rebalanceDirection === RebalanceDirection.Repay
    ) {
      return this.values.intermediaryLiqUtilizationRateBps;
    }

    const fees = new SolautoFeesBps(
      this.client.isReferred,
      this.targetLiqUtilizationRateBps,
      this.client.pos.netWorthUsd(PriceType.Realtime)
    );

    const { intermediaryLiqUtilizationRateBps } = applyDebtAdjustmentUsd(
      { debtAdjustmentUsd: this.values.debtAdjustmentUsd },
      {
        supplyUsd: this.client.pos.supplyUsd(PriceType.Ema),
        debtUsd: this.client.pos.debtUsd(PriceType.Ema),
      },
      fromBps(this.client.pos.state.liqThresholdBps),
      {
        solauto: fees.getSolautoFeesBps(this.values.rebalanceDirection).total,
        lpBorrow: this.client.pos.state.debt.borrowFeeBps,
        flashLoan: this.flRequirements?.flFeeBps ?? 0,
      }
    );

    return intermediaryLiqUtilizationRateBps;
  }

  private async flashLoanRequirements(
    attemptNum: number
  ): Promise<FlashLoanRequirements | undefined> {
    const intermediaryLiqUtilizationRateBps =
      this.intermediaryLiqUtilizationRateBps();
    const maxLtvRateBps = getMaxLiqUtilizationRateBps(
      this.client.pos.state.maxLtvBps,
      this.client.pos.state.liqThresholdBps,
      0.015
    );
    if (intermediaryLiqUtilizationRateBps < maxLtvRateBps) {
      return undefined;
    }

    const stdFlLiquiditySource = this.getFlLiquiditySource(
      attemptNum,
      this.client.flProvider.liquidityAvailable(TokenType.Supply),
      this.client.flProvider.liquidityAvailable(TokenType.Debt)
    );

    if (stdFlLiquiditySource === undefined || this.optimizeSize) {
      const { supplyBalance, debtBalance } = await this.client.signerBalances();
      const signerFlLiquiditySource = this.getFlLiquiditySource(
        attemptNum,
        supplyBalance,
        debtBalance
      );

      if (signerFlLiquiditySource) {
        return {
          liquiditySource: signerFlLiquiditySource,
          signerFlashLoan: true,
        };
      } else {
        throw new Error(`Insufficient liquidity to perform the transaction`);
      }
    } else {
      return {
        liquiditySource: stdFlLiquiditySource,
        flFeeBps: this.client.flProvider.flFeeBps(stdFlLiquiditySource),
      };
    }
  }

  private getFlashLoanDetails() {
    if (!this.flRequirements) {
      throw new Error("Flash loan requirements data needed");
    }

    const boosting =
      this.values.rebalanceDirection === RebalanceDirection.Boost;
    const useDebtLiquidity =
      this.flRequirements.liquiditySource === TokenType.Debt;

    let flashLoanToken: PositionTokenState | undefined = undefined;
    if (boosting || useDebtLiquidity) {
      flashLoanToken = this.client.pos.state.debt;
    } else {
      flashLoanToken = this.client.pos.state.supply;
    }

    return {
      ...this.flRequirements,
      baseUnitAmount: this.swapManager.flBorrowAmount!,
      mint: toWeb3JsPublicKey(flashLoanToken.mint),
    };
  }

  private setRebalanceType() {
    if (this.flRequirements) {
      const tokenBalanceChangeType = this.values.tokenBalanceChange?.changeType;
      const firstRebalanceTokenChanges =
        tokenBalanceChangeType === TokenBalanceChangeType.PreSwapDeposit;
      const lastRebalanceTokenChanges = [
        TokenBalanceChangeType.PostSwapDeposit,
        TokenBalanceChangeType.PostRebalanceWithdrawDebtToken,
        TokenBalanceChangeType.PostRebalanceWithdrawSupplyToken,
      ].includes(tokenBalanceChangeType ?? TokenBalanceChangeType.None);

      const swapType = this.swapManager.swapParams.exactIn
        ? SwapType.ExactIn
        : SwapType.ExactOut;

      if (
        (firstRebalanceTokenChanges && swapType === SwapType.ExactIn) ||
        (lastRebalanceTokenChanges && swapType === SwapType.ExactOut)
      ) {
        this.rebalanceType = SolautoRebalanceType.DoubleRebalanceWithFL;
      } else {
        this.rebalanceType =
          swapType === SwapType.ExactOut
            ? SolautoRebalanceType.FLRebalanceThenSwap
            : SolautoRebalanceType.FLSwapThenRebalance;
      }
    } else {
      this.rebalanceType = SolautoRebalanceType.Regular;
    }
  }

  private getInitialRebalanceValues() {
    let rebalanceValues = this.getRebalanceValues();
    if (!rebalanceValues) {
      return undefined;
    }

    if (
      !this.client.pos.rebalance.validRealtimePricesBoost(
        rebalanceValues.debtAdjustmentUsd
      )
    ) {
      this.priceType = PriceType.Ema;
      rebalanceValues = this.getRebalanceValues();
      if (!rebalanceValues) {
        return undefined;
      }
    }

    return rebalanceValues;
  }

  private async setRebalanceDetails(attemptNum: number): Promise<boolean> {
    const rebalanceValues = this.getInitialRebalanceValues();
    if (!rebalanceValues) {
      return false;
    }
    this.values = rebalanceValues;

    this.flRequirements = await this.flashLoanRequirements(attemptNum);
    if (this.flRequirements?.flFeeBps) {
      this.values = this.getRebalanceValues()!;
    }

    this.swapManager = new RebalanceSwapManager(
      this.client,
      this.values,
      this.flRequirements,
      this.targetLiqUtilizationRateBps,
      this.priceType
    );
    await this.swapManager.setSwapParams(attemptNum);

    this.setRebalanceType();
    return true;
  }

  private async refreshBeforeRebalance() {
    if (
      this.client.pos.selfManaged ||
      this.client.contextUpdates.supplyAdjustment > BigInt(0) ||
      this.client.contextUpdates.debtAdjustment > BigInt(0) ||
      !this.client.pos.exists
    ) {
      return false;
    }
    // Rebalance ix will already refresh internally if position is self managed

    const utilizationRateDiff = Math.abs(
      await this.client.pos.utilizationRateBpsDrift(this.priceType)
    );
    consoleLog("Liq utilization rate diff:", utilizationRateDiff);

    if (utilizationRateDiff >= 5) {
      consoleLog("Refreshing before rebalance");
      return true;
    }

    consoleLog("Not refreshing before rebalance");
    return false;
  }

  private async assembleTransaction(): Promise<TransactionItemInputs> {
    const { swapQuote, lookupTableAddresses, setupIx, swapIx } =
      await this.swapManager.getSwapTxData();

    const flashLoanDetails = this.flRequirements
      ? this.getFlashLoanDetails()
      : undefined;

    let tx = transactionBuilder();

    if (await this.refreshBeforeRebalance()) {
      tx = tx.add(this.client.refreshIx(this.priceType));
    }

    const rebalanceDetails: RebalanceDetails = {
      values: this.values,
      rebalanceType: this.rebalanceType,
      flashLoan: flashLoanDetails,
      swapQuote,
      targetLiqUtilizationRateBps: this.targetLiqUtilizationRateBps,
      priceType: this.priceType,
    };
    consoleLog("Rebalance details:", rebalanceDetails);
    consoleLog(
      "Prices:",
      safeGetPrice(this.client.pos.supplyMint, this.priceType),
      this.client.pos.supplyPrice(this.priceType),
      safeGetPrice(this.client.pos.debtMint, this.priceType),
      this.client.pos.debtPrice(this.priceType)
    );

    if (isMarginfiPosition(this.client.pos)) {
      const supply =
        this.values.endResult.supplyUsd *
        bytesToI80F48(this.client.pos.supplyBank!.config.assetWeightInit.value);
      const debt =
        this.values.endResult.debtUsd *
        bytesToI80F48(
          this.client.pos.debtBank!.config.liabilityWeightInit.value
        );
      consoleLog("Weighted values", supply, debt);
    }

    const firstRebalance = this.client.rebalanceIx(
      RebalanceStep.PreSwap,
      rebalanceDetails
    );
    const lastRebalance = this.client.rebalanceIx(
      RebalanceStep.PostSwap,
      rebalanceDetails
    );

    if (!flashLoanDetails) {
      tx = tx.add([setupIx, firstRebalance, swapIx, lastRebalance]);
    } else {
      const exactOut = swapQuote.swapMode === "ExactOut";
      const addFirstRebalance = hasFirstRebalance(this.rebalanceType);
      const addLastRebalance = hasLastRebalance(this.rebalanceType);

      const flashBorrowDest = exactOut
        ? getTokenAccount(
            this.client.pos.publicKey,
            new PublicKey(swapQuote.outputMint)
          )
        : getTokenAccount(
            toWeb3JsPublicKey(this.client.signer.publicKey),
            new PublicKey(swapQuote.inputMint)
          );

      consoleLog("Flash borrow dest:", flashBorrowDest.toString());
      tx = tx.add([
        setupIx,
        this.client.flProvider.flashBorrow(flashLoanDetails, flashBorrowDest),
        ...(addFirstRebalance ? [firstRebalance] : []),
        swapIx,
        ...(addLastRebalance ? [lastRebalance] : []),
        this.client.flProvider.flashRepay(flashLoanDetails),
      ]);
    }

    return {
      tx,
      lookupTableAddresses,
    };
  }

  public async buildRebalanceTx(
    attemptNum: number
  ): Promise<TransactionItemInputs | undefined> {
    await this.client.pos.refreshPositionState();

    if (!this.shouldProceedWithRebalance()) {
      this.client.log("Not eligible for a rebalance");
      return undefined;
    }

    const proceed = await this.setRebalanceDetails(attemptNum);
    if (!proceed) {
      return undefined;
    }

    return await this.assembleTransaction();
  }
}
