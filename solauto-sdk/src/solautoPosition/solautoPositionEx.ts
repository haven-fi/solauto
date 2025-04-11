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
  PriceType,
  SolautoPosition,
  SolautoSettingsParameters,
} from "../generated";
import {
  calcDebtUsd,
  calcNetWorth,
  calcSupplyUsd,
  calcTotalDebt,
  calcTotalSupply,
  consoleLog,
  ContextUpdates,
  currentUnixSeconds,
  debtLiquidityAvailable,
  debtLiquidityUsdAvailable,
  getLiqUtilzationRateBps,
  maxBoostToBps,
  maxRepayFromBps,
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
import { ProgramEnv, RebalanceAction } from "../types";
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
  lpEnv?: ProgramEnv;
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
  protected contextUpdates?: ContextUpdates;

  public publicKey!: PublicKey;
  public lendingPlatform!: LendingPlatform;
  protected _data!: SolautoPositionExData;
  protected lp?: PublicKey = undefined;
  protected lpEnv!: ProgramEnv;
  public lpUserAccount?: PublicKey = undefined;

  private readonly firstState!: PositionState;
  protected _supplyPrice?: number;
  protected _debtPrice?: number;

  constructor(args: PositionExArgs) {
    this.umi = args.umi;
    this.publicKey = args.publicKey;
    this.contextUpdates = args.contextUpdates;

    this.lp = args.customArgs?.lendingPool;
    this.lpUserAccount =
      args.customArgs?.lpUserAccount ??
      (args.data.position
        ? toWeb3JsPublicKey(args.data.position!.lpUserAccount)
        : undefined);
    this.lpEnv = args.customArgs?.lpEnv ?? "Prod";

    this._data = args.data;
    this.firstState = { ...args.data.state };
  }

  abstract lendingPool(): Promise<PublicKey>;

  get exists() {
    return this._data.position !== undefined;
  }

  get authority() {
    return this._data.authority
      ? toWeb3JsPublicKey(this._data.authority)
      : PublicKey.default;
  }

  get positionId() {
    return this._data.positionId ? this._data.positionId[0] : undefined;
  }

  get positionType() {
    return this._data.positionType;
  }

  get strategyName() {
    return solautoStrategyName(this.supplyMint, this.debtMint);
  }

  liqUtilizationRateBps(priceType?: PriceType): number {
    return getLiqUtilzationRateBps(
      this.supplyUsd(priceType),
      this.debtUsd(priceType),
      this.state.liqThresholdBps
    );
  }

  protected get data(): SolautoPositionExData {
    return this._data;
  }

  get state(): PositionState {
    return this.data.state;
  }

  get settings(): SolautoSettingsParameters | undefined {
    return this.contextUpdates?.settings ?? this.data.position?.settings;
  }

  updateSettings(settings: SolautoSettingsParameters) {
    this.data.position!.settings = settings;
  }

  get dca(): DCASettings | undefined {
    return this.contextUpdates?.dca ?? this.data.position?.dca;
  }

  updateDca(dca: DCASettings) {
    this.data.position!.dca = dca;
  }

  get supplyMint(): PublicKey {
    return toWeb3JsPublicKey(this.state.supply.mint);
  }

  get supplyMintInfo(): TokenInfo {
    return tokenInfo(this.supplyMint);
  }

  get debtMint(): PublicKey {
    return toWeb3JsPublicKey(this.state.debt.mint);
  }

  get debtMintInfo(): TokenInfo {
    return tokenInfo(this.debtMint);
  }

  get boostToBps() {
    return Math.min(this.settings?.boostToBps ?? 0, this.maxBoostToBps);
  }

  get maxBoostToBps() {
    return maxBoostToBps(this.state.maxLtvBps, this.state.liqThresholdBps);
  }

  get boostFromBps() {
    return this.boostToBps - (this.settings?.boostGap ?? 0);
  }

  get repayToBps() {
    return Math.min(this.settings?.repayToBps ?? 0, this.maxRepayToBps);
  }

  get maxRepayToBps() {
    return maxRepayToBps(this.state.maxLtvBps, this.state.liqThresholdBps);
  }

  get repayFromBps() {
    return Math.min(
      (this.settings?.repayToBps ?? 0) + (this.settings?.repayGap ?? 0),
      this.maxRepayFromBps
    );
  }

  get maxRepayFromBps() {
    return maxRepayFromBps(this.state.maxLtvBps, this.state.liqThresholdBps);
  }

  get netWorth() {
    return calcNetWorth(this.state);
  }

  netWorthUsd(priceType?: PriceType) {
    return this.supplyUsd(priceType) - this.debtUsd(priceType);
  }

  get totalSupply() {
    return calcTotalSupply(this.state);
  }

  supplyUsd(priceType?: PriceType) {
    const supplyPrice = this.supplyPrice(priceType);
    return supplyPrice
      ? calcTotalSupply(this.state) * supplyPrice
      : calcSupplyUsd(this.state);
  }

  protected supplyPrice(priceType?: PriceType) {
    return this._supplyPrice ?? safeGetPrice(this.supplyMint, priceType);
  }

  get totalDebt() {
    return calcTotalDebt(this.state);
  }

  debtUsd(priceType?: PriceType) {
    const debtPrice = this.debtPrice(priceType);
    return debtPrice
      ? calcTotalDebt(this.state) * debtPrice
      : calcDebtUsd(this.state);
  }

  protected debtPrice(priceType?: PriceType) {
    return this._debtPrice ?? safeGetPrice(this.debtMint, priceType);
  }

  get supplyLiquidityDepositable() {
    return supplyLiquidityDepositable(this.state);
  }

  get supplyLiquidityUsdDepositable() {
    return supplyLiquidityUsdDepositable(this.state);
  }

  get supplyLiquidityUsdAvailable() {
    return this.supplyLiquidityAvailable * (this.supplyPrice() ?? 0);
  }

  get debtLiquidityAvailable() {
    return debtLiquidityAvailable(this.state);
  }

  get debtLiquidityUsdAvailable() {
    return debtLiquidityUsdAvailable(this.state);
  }

  abstract get supplyLiquidityAvailable(): number;

  abstract maxLtvAndLiqThresholdBps(): Promise<[number, number]>;
  abstract priceOracles(): Promise<PublicKey[]>;

  private sufficientLiquidityToBoost() {
    const limitsUpToDate =
      this.debtLiquidityUsdAvailable !== 0 ||
      this.supplyLiquidityUsdDepositable !== 0;

    if (limitsUpToDate) {
      const { debtAdjustmentUsd } = getDebtAdjustment(
        this.state.liqThresholdBps,
        { supplyUsd: this.supplyUsd(), debtUsd: this.debtUsd() },
        this.boostToBps,
        { solauto: 50, lpBorrow: 50, flashLoan: 50 } // TODO: get true data here instead of magic numbers
      );

      const sufficientLiquidity =
        this.debtLiquidityUsdAvailable * 0.95 > debtAdjustmentUsd &&
        this.supplyLiquidityUsdDepositable * 0.95 > debtAdjustmentUsd;

      if (!sufficientLiquidity) {
        consoleLog("Insufficient liquidity to further boost");
      }
      return sufficientLiquidity;
    }

    return true;
  }

  eligibleForRebalance(bpsDistanceThreshold = 0): RebalanceAction | undefined {
    if (!this.settings || !this.supplyUsd()) {
      return undefined;
    }

    const realtimeLiqUtilRateBps = this.liqUtilizationRateBps(
      PriceType.Realtime
    );
    const emaLiqUtilRateBps = this.liqUtilizationRateBps(PriceType.Ema);

    if (this.repayFromBps - realtimeLiqUtilRateBps <= bpsDistanceThreshold) {
      return "repay";
    } else if (
      realtimeLiqUtilRateBps - this.boostFromBps <= bpsDistanceThreshold ||
      emaLiqUtilRateBps - this.boostFromBps <= bpsDistanceThreshold
    ) {
      const sufficientLiquidity = this.sufficientLiquidityToBoost();
      return sufficientLiquidity ? "boost" : undefined;
    }

    return undefined;
  }

  eligibleForRefresh(): boolean {
    if (this._data.selfManaged) return false;

    return (
      currentUnixSeconds() - Number(this.state.lastRefreshed) > 60 * 60 * 24 * 7
    );
  }

  protected canRefreshPositionState() {
    if (
      Number(this.state.lastRefreshed) >
        currentUnixSeconds() - MIN_POSITION_STATE_FRESHNESS_SECS &&
      !this.contextUpdates?.positionUpdates()
    ) {
      return false;
    }
    return true;
  }

  abstract refreshPositionState(priceType?: PriceType): Promise<void>;

  async utilizationRateBpsDrift(priceType?: PriceType) {
    const supplyPrice = this.supplyPrice(priceType) ?? 0;
    const debtPrice = this.debtPrice(priceType) ?? 0;
    const oldState = await positionStateWithLatestPrices(
      this.firstState,
      supplyPrice,
      debtPrice
    );
    const newState = await positionStateWithLatestPrices(
      this.state,
      supplyPrice,
      debtPrice
    );

    return newState.liqUtilizationRateBps - oldState.liqUtilizationRateBps;
  }

  updateSupply(newSupplyUsd: number, supplyPrice?: number) {
    this._data.state.supply.amountUsed.baseAmountUsdValue =
      toRoundedUsdValue(newSupplyUsd);
    this._data.state.supply.amountUsed.baseUnit = toBaseUnit(
      newSupplyUsd / (supplyPrice ?? this.supplyPrice() ?? 0),
      this.supplyMintInfo.decimals
    );
  }

  updateSupplyPrice(price: number) {
    this._supplyPrice = price;
  }

  updateDebt(newDebtUsd: number, debtPrice?: number) {
    this._data.state.debt.amountUsed.baseAmountUsdValue =
      toRoundedUsdValue(newDebtUsd);
    this._data.state.debt.amountUsed.baseUnit = toBaseUnit(
      newDebtUsd / (debtPrice ?? this.debtPrice() ?? 0),
      this.debtMintInfo.decimals
    );
  }

  updateDebtPrice(price: number) {
    this._debtPrice = price;
  }

  updateNetWorth(supplyPrice?: number) {
    const netWorthUsd = this.supplyUsd() - this.debtUsd();
    this._data.state.netWorth.baseAmountUsdValue =
      toRoundedUsdValue(netWorthUsd);
    this._data.state.netWorth.baseUnit = toBaseUnit(
      netWorthUsd / (supplyPrice ?? safeGetPrice(this.supplyMint) ?? 0),
      this.supplyMintInfo.decimals
    );
  }

  updateLiqUtilizationRate(
    supplyUsd?: number,
    debtUsd?: number,
    priceType?: PriceType
  ) {
    this._data.state.liqUtilizationRateBps = getLiqUtilzationRateBps(
      supplyUsd ?? this.supplyUsd(priceType),
      debtUsd ?? this.debtUsd(priceType),
      this.state.liqThresholdBps
    );
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
      PriceType.Realtime,
      targetLiqUtilizationRateBps,
      SolautoFeesBps.create(
        true,
        targetLiqUtilizationRateBps,
        this.netWorthUsd()
      )
    );
    if (!rebalance) {
      return undefined;
    }

    this.updateSupply(rebalance.endResult.supplyUsd, supplyPrice);
    this.updateDebt(rebalance.endResult.debtUsd, debtPrice);
    this.updateNetWorth(supplyPrice);
    this.updateLiqUtilizationRate(
      rebalance.endResult.supplyUsd,
      rebalance.endResult.debtUsd
    );
  }

  async refetchPositionData() {
    this._data = await fetchSolautoPosition(
      this.umi,
      fromWeb3JsPublicKey(this.publicKey)
    );
  }
}
