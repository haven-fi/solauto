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
  consoleLog,
  fromBaseUnit,
  getLiqUtilzationRateBps,
  getMaxLiqUtilizationRateBps,
  getTokenAccount,
  hasFirstRebalance,
  hasLastRebalance,
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
import { getRebalanceValues, RebalanceValues } from "./rebalanceValues";
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
    private targetLiqUtilizationRateBps?: number
  ) {}

  private shouldProceedWithRebalance() {
    return (
      this.client.pos.supplyUsd() > 0 &&
      (this.targetLiqUtilizationRateBps !== undefined ||
        this.client.pos.eligibleForRebalance())
    );
  }

  private getRebalanceValues(flFee?: number) {
    return getRebalanceValues(
      this.client.pos,
      this.priceType,
      this.targetLiqUtilizationRateBps,
      SolautoFeesBps.create(
        this.client.isReferred(),
        this.targetLiqUtilizationRateBps,
        this.client.pos.netWorthUsd(this.priceType)
      ),
      flFee ?? 0
    );
  }

  private getFlLiquiditySource(
    supplyLiquidityAvailable: bigint,
    debtLiquidityAvailable: bigint
  ): TokenType | undefined {
    const debtAdjustmentUsd = Math.abs(this.values.debtAdjustmentUsd);

    const insufficientLiquidity = (
      amountNeededUsd: number,
      liquidityAvailable: bigint,
      tokenMint: PublicKey
    ) => {
      return (
        amountNeededUsd >
        fromBaseUnit(liquidityAvailable, tokenInfo(tokenMint).decimals) *
          (safeGetPrice(tokenMint) ?? 0) *
          0.95
      );
    };

    const insufficientSupplyLiquidity = insufficientLiquidity(
      debtAdjustmentUsd,
      supplyLiquidityAvailable,
      this.client.pos.supplyMint
    );
    const insufficientDebtLiquidity = insufficientLiquidity(
      debtAdjustmentUsd,
      debtLiquidityAvailable,
      this.client.pos.debtMint
    );

    let useDebtLiquidity =
      this.values.rebalanceDirection === RebalanceDirection.Boost ||
      insufficientSupplyLiquidity;

    if (useDebtLiquidity) {
      return !insufficientDebtLiquidity ? TokenType.Debt : undefined;
    } else {
      return !insufficientSupplyLiquidity ? TokenType.Supply : undefined;
    }
  }

  private async flashLoanRequirements(
    attemptNum: number
  ): Promise<FlashLoanRequirements | undefined> {
    const maxLtvRateBps = getMaxLiqUtilizationRateBps(
      this.client.pos.state.maxLtvBps,
      this.client.pos.state.liqThresholdBps,
      0.01
    );
    if (this.values.intermediaryLiqUtilizationRateBps < maxLtvRateBps) {
      return undefined;
    }

    const stdFlLiquiditySource = this.getFlLiquiditySource(
      this.client.flProvider.liquidityAvailable(TokenType.Supply),
      this.client.flProvider.liquidityAvailable(TokenType.Debt)
    );

    if ((attemptNum ?? 0) >= 3 || stdFlLiquiditySource === undefined) {
      const { supplyBalance, debtBalance } = await this.client.signerBalances();
      const signerFlLiquiditySource = this.getFlLiquiditySource(
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

  private realtimeUsdToEmaUsd(realtimeAmountUsd: number, mint: PublicKey) {
    return (
      (realtimeAmountUsd / safeGetPrice(mint, PriceType.Realtime)!) *
      safeGetPrice(mint, PriceType.Ema)!
    );
  }

  private getInitialRebalanceValues() {
    let rebalanceValues = this.getRebalanceValues();
    if (!rebalanceValues) {
      return undefined;
    }

    const postRebalanceEmaUtilRateBps = getLiqUtilzationRateBps(
      this.realtimeUsdToEmaUsd(
        rebalanceValues.endResult.supplyUsd,
        this.client.pos.supplyMint
      ),
      this.realtimeUsdToEmaUsd(
        rebalanceValues.endResult.debtUsd,
        this.client.pos.debtMint
      ),
      this.client.pos.state.liqThresholdBps
    );
    if (postRebalanceEmaUtilRateBps > this.client.pos.maxBoostToBps) {
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
      this.values = this.getRebalanceValues(this.flRequirements.flFeeBps)!;
    }

    this.swapManager = new RebalanceSwapManager(
      this.client,
      this.values,
      this.flRequirements,
      this.targetLiqUtilizationRateBps
    );
    await this.swapManager.setSwapParams(attemptNum);

    this.setRebalanceType();
    return true;
  }

  private async refreshBeforeRebalance() {
    if (
      this.client.selfManaged ||
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

    if (utilizationRateDiff >= 10) {
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
