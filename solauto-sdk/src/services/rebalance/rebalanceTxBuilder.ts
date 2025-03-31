import { SolautoClient } from "..";
import {
  FlashLoanDetails,
  FlashLoanRequirements,
  TransactionItemInputs,
} from "../../types";
import {
  fromBaseUnit,
  getMaxLiqUtilizationRateBps,
  safeGetPrice,
  tokenInfo,
} from "../../utils";
import { getRebalanceValues, RebalanceValues } from "./rebalanceValues";
import { SolautoFeesBps } from "./solautoFees";
import {
  RebalanceDirection,
  SolautoRebalanceType,
  TokenType,
} from "../../generated";
import { PublicKey } from "@solana/web3.js";
import { QuoteResponse } from "@jup-ag/api";

export class RebalanceTxBuilder {
  private rebalanceValues!: RebalanceValues;
  private flashLoan: FlashLoanDetails | undefined = undefined;
  private jupQuote!: QuoteResponse;
  private rebalanceType!: SolautoRebalanceType;

  constructor(
    private client: SolautoClient,
    private targetLiqUtilizationRateBps?: number
  ) {}

  private async shouldProceedWithRebalance() {
    await this.client.solautoPosition.refreshPositionState();

    return (
      this.client.solautoPosition.supplyUsd() > 0 &&
      (this.targetLiqUtilizationRateBps !== undefined ||
        this.client.solautoPosition.eligibleForRebalance())
    );
  }

  private getRebalanceValues(flFee?: number) {
    return getRebalanceValues(
      this.client.solautoPosition,
      new SolautoFeesBps(
        this.client.isReferred(),
        this.targetLiqUtilizationRateBps,
        this.client.solautoPosition.netWorthUsd()
      ),
      flFee ?? 0,
      this.targetLiqUtilizationRateBps
    );
  }

  private getFlLiquiditySource(
    supplyLiquidityAvailable: bigint,
    debtLiquidityAvailable: bigint
  ): TokenType | undefined {
    const debtAdjustmentUsd = Math.abs(this.rebalanceValues.debtAdjustmentUsd);

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
      this.client.solautoPosition.supplyMint()
    );
    const insufficientDebtLiquidity = insufficientLiquidity(
      debtAdjustmentUsd,
      debtLiquidityAvailable,
      this.client.solautoPosition.debtMint()
    );

    let useDebtLiquidity =
      this.rebalanceValues.rebalanceDirection === RebalanceDirection.Boost ||
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
      this.client.solautoPosition.state().maxLtvBps,
      this.client.solautoPosition.state().liqThresholdBps,
      0.015
    );

    if (
      this.rebalanceValues.intermediaryLiqUtilizationRateBps < maxLtvRateBps
    ) {
      return undefined;
    }

    const stdFlLiquiditySource = this.getFlLiquiditySource(
      this.client.flProvider.liquidityAvailable(TokenType.Supply),
      this.client.flProvider.liquidityAvailable(TokenType.Debt)
    );

    if ((attemptNum ?? 0) >= 3 || !stdFlLiquiditySource) {
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
      return { liquiditySource: stdFlLiquiditySource };
    }
  }

  private async setRebalanceDetails(attemptNum: number) {
    this.rebalanceValues = this.getRebalanceValues();
    const flRequirements = await this.flashLoanRequirements(attemptNum);

    // TODO? We need to find sufficient quote, and then half-apply that amount to get the real intermediaryLiqUtilizationRateBps

    if (flRequirements) {
      this.rebalanceValues = this.getRebalanceValues(
        this.client.flProvider.flFeeBps(flRequirements)
      );

      // TODO: set flashLoan and rebalanceType and jupQuote
    } else {
      // TODO: set jupQuote
      this.rebalanceType = SolautoRebalanceType.Regular;
    }
  }

  private assembleTransaction(): TransactionItemInputs {
    // TODO: check if should refresh beforehand
  }

  public async buildRebalanceTx(
    attemptNum: number
  ): Promise<TransactionItemInputs | undefined> {
    if (!this.shouldProceedWithRebalance()) {
      this.client.log("Not eligible for a rebalance");
      return undefined;
    }

    await this.setRebalanceDetails(attemptNum);
    return this.assembleTransaction();
  }
}
