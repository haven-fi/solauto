import { PublicKey } from "@solana/web3.js";
import { Umi } from "@metaplex-foundation/umi";
import {
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import {
  DCASettings,
  fetchSolautoPosition,
  LendingPlatform,
  PositionState,
  SolautoPosition,
  SolautoSettingsParameters,
} from "../generated";
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
  debtLiquidityAvailable,
  debtLiquidityUsdAvailable,
  fetchTokenPrices,
  getLiqUtilzationRateBps,
  maxBoostToBps,
  maxRepayToBps,
  positionStateWithLatestPrices,
  safeGetPrice,
  solautoStrategyName,
  supplyLiquidityDepositable,
  supplyLiquidityUsdDepositable,
  toBaseUnit,
  tokenInfo,
  toRoundedUsdValue,
} from "../utils";
import { RebalanceAction } from "../types";
import {
  getDebtAdjustment,
  getRebalanceValues,
  SolautoFeesBps,
} from "../services/rebalance";
import { MIN_POSITION_STATE_FRESHNESS_SECS, TokenInfo } from "../constants";

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
  protected _data!: SolautoPositionExData;
  protected lp?: PublicKey = undefined;
  public lpUserAccount?: PublicKey = undefined;
  protected contextUpdates?: ContextUpdates;

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

    this._data = args.data;
    this.firstState = { ...args.data.state };
  }

  abstract lendingPool(): Promise<PublicKey>;

  exists() {
    return this._data.position !== undefined;
  }

  authority() {
    return this._data.authority
      ? toWeb3JsPublicKey(this._data.authority)
      : undefined;
  }

  positionId() {
    return this._data.positionId ? this._data.positionId[0] : undefined;
  }

  strategyName() {
    return solautoStrategyName(
      toWeb3JsPublicKey(this.state().supply.mint),
      toWeb3JsPublicKey(this.state().debt.mint)
    );
  }

  data(): SolautoPositionExData {
    return this._data;
  }

  state(): PositionState {
    return this.data().state;
  }

  settings(): SolautoSettingsParameters | undefined {
    return this.contextUpdates?.settings ?? this.data().position?.settings;
  }

  dca(): DCASettings | undefined {
    return this.contextUpdates?.dca ?? this.data().position?.dca;
  }

  supplyMint(): PublicKey {
    return toWeb3JsPublicKey(this.state().supply.mint);
  }

  supplyMintInfo(): TokenInfo {
    return tokenInfo(this.supplyMint());
  }

  debtMint(): PublicKey {
    return toWeb3JsPublicKey(this.state().debt.mint);
  }

  debtMintInfo(): TokenInfo {
    return tokenInfo(this.debtMint());
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

  supplyLiquidityDepositable() {
    return supplyLiquidityDepositable(this.state());
  }

  supplyLiquidityUsdDepositable() {
    return supplyLiquidityUsdDepositable(this.state());
  }

  supplyLiquidityUsdAvailable() {
    return this.supplyLiquidityAvailable() * (safeGetPrice(this.supplyMint()) ?? 0);
  }

  debtLiquidityAvailable() {
    return debtLiquidityAvailable(this.state());
  }

  debtLiquidityUsdAvailable() {
    return debtLiquidityUsdAvailable(this.state());
  }

  abstract maxLtvAndLiqThresholdBps(): Promise<[number, number]>;
  abstract supplyLiquidityAvailable(): number;

  sufficientLiquidityToBoost() {
    const limitsUpToDate =
      this.debtLiquidityUsdAvailable() !== 0 ||
      this.supplyLiquidityUsdDepositable() !== 0;

    if (limitsUpToDate) {
      const { debtAdjustmentUsd } = getDebtAdjustment(
        this.state().liqThresholdBps,
        { supplyUsd: this.supplyUsd(), debtUsd: this.debtUsd() },
        this.boostToBps(),
        { solauto: 50, lpBorrow: 50, flashLoan: 50 } // TODO: get true data here instead of magic numbers
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
    if (this._data.selfManaged) return false;

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

  updateSupply(newSupplyUsd: number, supplyPrice?: number) {
    this._data.state.supply.amountUsed.baseAmountUsdValue =
      toRoundedUsdValue(newSupplyUsd);
    this._data.state.supply.amountUsed.baseUnit = toBaseUnit(
      newSupplyUsd / (supplyPrice ?? safeGetPrice(this.supplyMint()) ?? 0),
      this.supplyMintInfo().decimals
    );
  }

  updateDebt(newDebtUsd: number, debtPrice?: number) {
    this._data.state.debt.amountUsed.baseAmountUsdValue =
      toRoundedUsdValue(newDebtUsd);
    this._data.state.debt.amountUsed.baseUnit = toBaseUnit(
      newDebtUsd / (debtPrice ?? safeGetPrice(this.debtMint()) ?? 0),
      this.debtMintInfo().decimals
    );
  }

  updateNetWorth(supplyPrice?: number) {
    const netWorthUsd = this.supplyUsd() - this.debtUsd();
    this._data.state.netWorth.baseAmountUsdValue =
      toRoundedUsdValue(netWorthUsd);
    this._data.state.netWorth.baseUnit = toBaseUnit(
      netWorthUsd / (supplyPrice ?? safeGetPrice(this.supplyMint()) ?? 0),
      this.supplyMintInfo().decimals
    );
  }

  updateLiqUtilizationRate() {
    this._data.state.liqUtilizationRateBps = getLiqUtilzationRateBps(
      this.supplyUsd(),
      this.debtUsd(),
      this.state().liqThresholdBps
    );
  }

  async updateWithLatestPrices(supplyPrice?: number, debtPrice?: number) {
    if (!supplyPrice || !debtPrice) {
      [supplyPrice, debtPrice] = await fetchTokenPrices([
        this.supplyMint(),
        this.debtMint(),
      ]);
    }

    const supplyUsd = this.totalSupply() * supplyPrice;
    const debtUsd = this.totalDebt() * debtPrice;

    this.updateSupply(supplyUsd, supplyPrice);
    this.updateDebt(debtUsd, debtPrice);
    this.updateNetWorth(supplyPrice);
    this.updateLiqUtilizationRate();
  }

  simulateRebalance(
    unixTime: number,
    supplyPrice: number,
    debtPrice: number,
    targetLiqUtilizationRateBps?: number
  ) {
    this._data.state.lastRefreshed = BigInt(unixTime);
    const rebalance = getRebalanceValues(
      this,
      targetLiqUtilizationRateBps,
      SolautoFeesBps.create(
        true,
        targetLiqUtilizationRateBps,
        this.netWorthUsd()
      )
    );
    this.updateSupply(rebalance.endResult.supplyUsd, supplyPrice);
    this.updateDebt(rebalance.endResult.debtUsd, debtPrice);
    this.updateNetWorth(supplyPrice);
    this.updateLiqUtilizationRate();
  }

  async refetchPositionData() {
    this._data = await fetchSolautoPosition(
      this.umi,
      fromWeb3JsPublicKey(this.publicKey)
    );
  }
}
