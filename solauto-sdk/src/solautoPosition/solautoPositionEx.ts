import { PublicKey } from "@solana/web3.js";
import { Umi } from "@metaplex-foundation/umi";
import {
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import {
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
  getSolautoPositionAccount,
  maxBoostToBps,
  maxRepayFromBps,
  maxRepayToBps,
  positionStateWithLatestPrices,
  realtimeUsdToEmaUsd,
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
import { TokenInfo } from "../constants";

export interface PositionCustomArgs {
  lendingPlatform: LendingPlatform;
  supplyMint?: PublicKey;
  debtMint?: PublicKey;
  lpPoolAccount?: PublicKey;
  lpUserAccount?: PublicKey;
  lpEnv?: ProgramEnv;
}

interface SolautoPositionExData extends Partial<SolautoPosition> {
  state: PositionState;
}

export interface PositionExArgs {
  umi: Umi;
  publicKey?: PublicKey;
  programId?: PublicKey;
  authority?: PublicKey;
  positionId?: number;
  data: SolautoPositionExData;
  customArgs?: PositionCustomArgs;
  contextUpdates?: ContextUpdates;
}

export abstract class SolautoPositionEx {
  public umi!: Umi;
  protected contextUpdates?: ContextUpdates;

  public publicKey!: PublicKey;
  public lendingPlatform!: LendingPlatform;
  public positionId!: number;
  public authority!: PublicKey;
  protected _lpPoolAccount?: PublicKey;
  public lpUserAccount?: PublicKey = undefined;
  protected lpEnv!: ProgramEnv;
  private _supplyMint?: PublicKey;
  private _debtMint?: PublicKey;
  protected _data!: SolautoPositionExData;

  private readonly firstState!: PositionState;

  private _supplyPrice?: number;
  private _debtPrice?: number;

  public rebalance!: PositionRebalanceHelper;
  public maxLtvPriceType!: PriceType;

  constructor(args: PositionExArgs) {
    this.umi = args.umi;
    this.contextUpdates = args.contextUpdates;

    this.publicKey =
      args.publicKey ??
      getSolautoPositionAccount(
        args.authority!,
        args.positionId!,
        args.programId!
      );
    this.positionId = args.positionId ?? args.data.positionId![0];
    this.authority = args.authority ?? toWeb3JsPublicKey(args.data.authority!);

    this._lpPoolAccount = args.customArgs?.lpPoolAccount;
    this.lpUserAccount =
      args.customArgs?.lpUserAccount ??
      (args.data.position
        ? toWeb3JsPublicKey(args.data.position!.lpUserAccount)
        : undefined);
    this.lpEnv = args.customArgs?.lpEnv ?? "Prod";
    this._supplyMint = args.customArgs?.supplyMint;
    this._debtMint = args.customArgs?.debtMint;

    this._data = args.data;
    this.firstState = { ...args.data.state };

    this.rebalance = new PositionRebalanceHelper(this);
  }

  get exists() {
    return this._data.position !== undefined;
  }

  get selfManaged() {
    return this.positionId === 0;
  }

  get positionType() {
    return this._data.positionType;
  }

  get strategyName() {
    return solautoStrategyName(this.supplyMint, this.debtMint);
  }

  get lpPoolAccount() {
    return (
      this._lpPoolAccount ??
      toWeb3JsPublicKey(this.data.position!.lpPoolAccount)
    );
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

  get supplyMint(): PublicKey {
    return this._supplyMint ?? toWeb3JsPublicKey(this.state.supply.mint);
  }

  get supplyMintInfo(): TokenInfo {
    return tokenInfo(this.supplyMint);
  }

  get debtMint(): PublicKey {
    return this._debtMint ?? toWeb3JsPublicKey(this.state.debt.mint);
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

  get memecoinPosition() {
    return tokenInfo(this.supplyMint).isMeme || tokenInfo(this.debtMint).isMeme;
  }

  eligibleForRebalance(
    bpsDistanceThreshold: number = 0,
    skipExtraChecks?: boolean
  ): RebalanceAction | undefined {
    return this.rebalance.eligibleForRebalance(
      bpsDistanceThreshold,
      skipExtraChecks
    );
  }

  eligibleForRefresh(): boolean {
    if (this.selfManaged) return false;

    return (
      currentUnixSeconds() - Number(this.state.lastRefreshed) > 60 * 60 * 24 * 7
    );
  }

  protected canRefreshPositionState() {
    if (
      currentUnixSeconds() - Number(this.state.lastRefreshed) > 5 ||
      this.contextUpdates?.positionUpdates()
    ) {
      return true;
    }
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

class PositionRebalanceHelper {
  constructor(private pos: SolautoPositionEx) {}

  private sufficientLiquidityToBoost() {
    const limitsUpToDate =
      this.pos.debtLiquidityUsdAvailable !== 0 ||
      this.pos.supplyLiquidityUsdDepositable !== 0;

    if (limitsUpToDate) {
      const { debtAdjustmentUsd } = getDebtAdjustment(
        this.pos.state.liqThresholdBps,
        { supplyUsd: this.pos.supplyUsd(), debtUsd: this.pos.debtUsd() },
        this.pos.boostToBps,
        { solauto: 50, lpBorrow: 50, flashLoan: 50 } // Overshoot fees
      );

      const sufficientLiquidity =
        this.pos.debtLiquidityUsdAvailable * 0.95 > debtAdjustmentUsd &&
        this.pos.supplyLiquidityUsdDepositable * 0.95 > debtAdjustmentUsd;

      if (!sufficientLiquidity) {
        consoleLog("Insufficient liquidity to further boost");
      }
      return sufficientLiquidity;
    }

    return true;
  }

  validRealtimePricesBoost(debtAdjustmentUsd: number) {
    if (this.pos.maxLtvPriceType !== PriceType.Ema) {
      return true;
    }

    const postRebalanceLiqUtilRate = getLiqUtilzationRateBps(
      realtimeUsdToEmaUsd(
        this.pos.supplyUsd() + debtAdjustmentUsd,
        this.pos.supplyMint
      ),
      realtimeUsdToEmaUsd(
        this.pos.debtUsd() + debtAdjustmentUsd,
        this.pos.debtMint
      ),
      this.pos.state.liqThresholdBps
    );

    return postRebalanceLiqUtilRate <= this.pos.maxBoostToBps;
  }

  private validBoostFromHere() {
    const realtimeSupplyUsd = this.pos.supplyUsd(PriceType.Realtime);
    const realtimeDebtUsd = this.pos.debtUsd(PriceType.Realtime);

    if (
      realtimeSupplyUsd === this.pos.supplyUsd(PriceType.Ema) &&
      realtimeDebtUsd === this.pos.debtUsd(PriceType.Ema)
    ) {
      return true;
    }

    const { debtAdjustmentUsd } = getDebtAdjustment(
      this.pos.state.liqThresholdBps,
      {
        supplyUsd: realtimeSupplyUsd,
        debtUsd: realtimeDebtUsd,
      },
      this.pos.boostToBps,
      { solauto: 25, lpBorrow: 0, flashLoan: 0 } // Undershoot fees
    );

    return this.validRealtimePricesBoost(debtAdjustmentUsd);
  }

  eligibleForRebalance(
    bpsDistanceThreshold: number,
    skipExtraChecks?: boolean
  ): RebalanceAction | undefined {
    if (this.pos.selfManaged || !this.pos.supplyUsd()) {
      return undefined;
    }

    const realtimeLiqUtilRateBps = this.pos.liqUtilizationRateBps(
      PriceType.Realtime
    );

    if (
      this.pos.repayFromBps - realtimeLiqUtilRateBps <=
      bpsDistanceThreshold
    ) {
      return "repay";
    } else if (
      realtimeLiqUtilRateBps - this.pos.boostFromBps <= bpsDistanceThreshold &&
      (skipExtraChecks ||
        (this.validBoostFromHere() && this.sufficientLiquidityToBoost()))
    ) {
      return "boost";
    }

    return undefined;
  }
}
