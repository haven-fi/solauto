import { PublicKey } from "@solana/web3.js";
import { SolautoPosition } from "../generated";
import { Umi } from "@metaplex-foundation/umi";
import {
  calcDebtUsd,
  calcSupplyUsd,
  consoleLog,
  ContextUpdates,
  currentUnixSeconds,
  debtLiquidityUsdAvailable,
  maxBoostToBps,
  maxRepayToBps,
  supplyLiquidityUsdDepositable,
} from "../utils";
import { RebalanceAction } from "../types";
import { getDebtAdjustment, getRebalanceValues } from "../rebalance";
import { MIN_POSITION_STATE_FRESHNESS_SECS } from "../constants";

export abstract class SolautoPositionEx {
  constructor(
    public data: SolautoPosition,
    public umi: Umi
  ) {}

  abstract lendingPool(): Promise<PublicKey>;

  public boostToBps() {
    return Math.min(
      this.data.position.settings.boostToBps,
      maxBoostToBps(this.data.state.maxLtvBps, this.data.state.liqThresholdBps)
    );
  }

  public boostFromBps() {
    return this.boostToBps() - this.data.position.settings.boostGap;
  }

  public repayToBps() {
    return Math.min(
      this.data.position.settings.repayToBps,
      maxRepayToBps(this.data.state.maxLtvBps, this.data.state.liqThresholdBps)
    );
  }

  public repayFromBps() {
    return (
      this.data.position.settings.repayToBps +
      this.data.position.settings.repayGap
    );
  }

  abstract supplyLiquidityDepositable(): bigint;
  abstract supplyLiquidityAvailable(): bigint;
  abstract debtLiquidityAvailable(): bigint;

  public supplyUsd() {
    return calcSupplyUsd(this.data.state);
  }

  public debtUsd() {
    return calcDebtUsd(this.data.state);
  }

  public supplyLiquidityUsdDepositable() {
    return supplyLiquidityUsdDepositable(this.data.state);
  }

  public debtLiquidityUsdAvailable() {
    return debtLiquidityUsdAvailable(this.data.state);
  }

  public sufficientLiquidityToBoost() {
    const limitsUpToDate =
      this.debtLiquidityUsdAvailable() > 0 ||
      this.supplyLiquidityUsdDepositable() > 0;

    if (limitsUpToDate) {
      const { debtAdjustmentUsd } = getDebtAdjustment(
        this.data.state.liqThresholdBps,
        { supplyUsd: this.supplyUsd(), debtUsd: this.debtUsd() },
        { solauto: 50, lpBorrow: 50, flashLoan: 50 }, // TODO: add better fix here instead of magic numbers
        this.boostToBps()
      );

      const sufficientLiquidity =
        this.debtLiquidityUsdAvailable() * 0.95 > debtAdjustmentUsd &&
        this.supplyLiquidityUsdDepositable() * 0.95 > debtAdjustmentUsd;

      if (!sufficientLiquidity) {
        consoleLog("Insufficient liquidity to further boost");
      }
      return sufficientLiquidity;
    }

    return true;
  }

  public eligibleForRebalance(
    bpsDistanceThreshold = 0
  ): RebalanceAction | undefined {
    if (!this.data.position.settings || !calcSupplyUsd(this.data.state)) {
      return undefined;
    }

    if (
      this.data.state.liqUtilizationRateBps - this.boostFromBps() <=
      bpsDistanceThreshold
    ) {
      const sufficientLiquidity = this.sufficientLiquidityToBoost();
      return sufficientLiquidity ? "boost" : undefined;
    } else if (
      this.repayFromBps() - this.data.state.liqUtilizationRateBps <=
      bpsDistanceThreshold
    ) {
      return "repay";
    }

    return undefined;
  }

  public eligibleForRefresh(): boolean {
    return (
      currentUnixSeconds() - Number(this.data.state.lastUpdated) >
      60 * 60 * 24 * 7
    );
  }

  async getFreshPositionState(
    contextUpdates?: ContextUpdates
  ): Promise<SolautoPosition | undefined> {
    if (
      Number(this.data.state.lastUpdated) >
        currentUnixSeconds() - MIN_POSITION_STATE_FRESHNESS_SECS &&
      !contextUpdates?.positionUpdates()
    ) {
      return this.data;
    }

    return undefined;
  }
}
