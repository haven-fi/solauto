import { PublicKey } from "@solana/web3.js";
import {
  DCASettings,
  fetchSolautoPosition,
  LendingPlatform,
  PositionState,
  SolautoPosition,
  SolautoSettingsParameters,
} from "../generated";
import { Umi } from "@metaplex-foundation/umi";
import {
  calcDebtUsd,
  calcNetWorth,
  calcNetWorthUsd,
  calcSupplyUsd,
  calcTotalDebt,
  calcTotalSupply,
  consoleLog,
  ContextUpdates,
  currentUnixSeconds,
  debtLiquidityUsdAvailable,
  maxBoostToBps,
  maxRepayToBps,
  positionStateWithLatestPrices,
  safeGetPrice,
  solautoStrategyName,
  supplyLiquidityUsdDepositable,
} from "../utils";
import { RebalanceAction } from "../types";
import { getDebtAdjustment } from "../services/rebalance";
import { MIN_POSITION_STATE_FRESHNESS_SECS } from "../constants";
import {
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";

export interface PositionCustomArgs {
  lendingPlatform: LendingPlatform;
  supplyMint?: PublicKey;
  debtMint?: PublicKey;
  lendingPool?: PublicKey;
  lpUserAccount?: PublicKey;
}

interface SolautoPositionExData extends Partial<SolautoPosition> {
  state: PositionState;
}

interface PositionExArgs {
  umi: Umi;
  publicKey: PublicKey;
  data: SolautoPositionExData;
  customArgs?: PositionCustomArgs;
  contextUpdates?: ContextUpdates;
}

export abstract class SolautoPositionEx {
  public umi!: Umi;
  public publicKey!: PublicKey;
  public data!: SolautoPositionExData;
  protected contextUpdates?: ContextUpdates;

  protected lp?: PublicKey = undefined;
  public lpUserAccount?: PublicKey = undefined;

  private readonly firstState!: PositionState;

  constructor(args: PositionExArgs) {
    this.umi = args.umi;
    this.publicKey = args.publicKey;
    this.contextUpdates = args.contextUpdates;

    this.lp = args.customArgs?.lendingPool;
    this.lpUserAccount =
      args.customArgs?.lpUserAccount ??
      (args.data.position
        ? toWeb3JsPublicKey(args.data.position!.protocolUserAccount)
        : undefined);

    this.data = args.data;
    this.firstState = { ...args.data.state };
  }

  abstract lendingPool(): Promise<PublicKey>;

  exists() {
    return this.data.position !== undefined;
  }

  strategyName() {
    return solautoStrategyName(
      toWeb3JsPublicKey(this.state().supply.mint),
      toWeb3JsPublicKey(this.state().debt.mint)
    );
  }

  settings(): SolautoSettingsParameters | undefined {
    return this.contextUpdates?.settings ?? this.data?.position?.settings;
  }

  dca(): DCASettings | undefined {
    return this.contextUpdates?.dca ?? this.data?.position?.dca;
  }

  state(): PositionState {
    return this.data.state;
  }

  supplyMint(): PublicKey {
    return toWeb3JsPublicKey(this.state().supply.mint);
  }

  debtMint(): PublicKey {
    return toWeb3JsPublicKey(this.state().debt.mint);
  }

  boostToBps() {
    return Math.min(
      this.settings()?.boostToBps ?? 0,
      maxBoostToBps(this.state().maxLtvBps, this.state().liqThresholdBps)
    );
  }

  boostFromBps() {
    return this.boostToBps() - (this.settings()?.boostGap ?? 0);
  }

  repayToBps() {
    return Math.min(
      this.settings()?.repayToBps ?? 0,
      maxRepayToBps(this.state().maxLtvBps, this.state().liqThresholdBps)
    );
  }

  repayFromBps() {
    return (
      (this.settings()?.repayToBps ?? 0) + (this.settings()?.repayGap ?? 0)
    );
  }

  netWorth() {
    return calcNetWorth(this.state());
  }

  netWorthUsd() {
    return calcNetWorthUsd(this.state());
  }

  totalSupply() {
    return calcTotalSupply(this.state());
  }

  supplyUsd() {
    return calcSupplyUsd(this.state());
  }

  totalDebt() {
    return calcTotalDebt(this.state());
  }

  debtUsd() {
    return calcDebtUsd(this.state());
  }

  supplyLiquidityUsdDepositable() {
    return supplyLiquidityUsdDepositable(this.state());
  }

  debtLiquidityUsdAvailable() {
    return debtLiquidityUsdAvailable(this.state());
  }

  abstract supplyLiquidityDepositable(): bigint;
  abstract supplyLiquidityAvailable(): bigint;
  abstract debtLiquidityAvailable(): bigint;

  sufficientLiquidityToBoost() {
    const limitsUpToDate =
      this.debtLiquidityUsdAvailable() !== 0 ||
      this.supplyLiquidityUsdDepositable() !== 0;

    if (limitsUpToDate) {
      const { debtAdjustmentUsd } = getDebtAdjustment(
        this.state().liqThresholdBps,
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

  eligibleForRebalance(bpsDistanceThreshold = 0): RebalanceAction | undefined {
    if (!this.settings() || !calcSupplyUsd(this.state())) {
      return undefined;
    }

    if (
      this.state().liqUtilizationRateBps - this.boostFromBps() <=
      bpsDistanceThreshold
    ) {
      const sufficientLiquidity = this.sufficientLiquidityToBoost();
      return sufficientLiquidity ? "boost" : undefined;
    } else if (
      this.repayFromBps() - this.state().liqUtilizationRateBps <=
      bpsDistanceThreshold
    ) {
      return "repay";
    }

    return undefined;
  }

  eligibleForRefresh(): boolean {
    if (this.data.selfManaged) return false;

    return (
      currentUnixSeconds() - Number(this.state().lastRefreshed) >
      60 * 60 * 24 * 7
    );
  }

  protected canRefreshPositionState() {
    if (
      Number(this.state().lastRefreshed) >
        currentUnixSeconds() - MIN_POSITION_STATE_FRESHNESS_SECS &&
      !this.contextUpdates?.positionUpdates()
    ) {
      return false;
    }
    return true;
  }

  abstract refreshPositionState(): Promise<void>;

  async utilizationRateBpsDrift() {
    const supplyPrice = safeGetPrice(this.state().supply.mint) ?? 0;
    const debtPrice = safeGetPrice(this.state().debt.mint) ?? 0;
    const oldState = await positionStateWithLatestPrices(
      this.firstState,
      supplyPrice,
      debtPrice
    );
    const newState = await positionStateWithLatestPrices(
      this.state(),
      supplyPrice,
      debtPrice
    );

    return newState.liqUtilizationRateBps - oldState.liqUtilizationRateBps;
  }

  async updateWithLatestPrices(supplyPrice?: number, debtPrice?: number) {
    this.data.state = await positionStateWithLatestPrices(
      this.state(),
      supplyPrice,
      debtPrice
    );
  }

  async refetchPositionData() {
    this.data = await fetchSolautoPosition(
      this.umi,
      fromWeb3JsPublicKey(this.publicKey)
    );
  }
}
