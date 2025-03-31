import { PublicKey } from "@solana/web3.js";
import {
  DCASettings,
  fetchSolautoPosition,
  LendingPlatform,
  PositionState,
  SolautoPosition,
  SolautoSettingsParameters,
  TokenType,
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
  fetchTokenPrices,
  fromBaseUnit,
  getLiqUtilzationRateBps,
  maxBoostToBps,
  maxRepayToBps,
  supplyLiquidityUsdDepositable,
  toBaseUnit,
  toRoundedUsdValue,
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
  }

  abstract lendingPool(): Promise<PublicKey>;

  public exists() {
    return this.data.position !== undefined;
  }

  public settings(): SolautoSettingsParameters | undefined {
    return this.contextUpdates?.settings ?? this.data?.position?.settings;
  }

  public dca(): DCASettings | undefined {
    return this.contextUpdates?.dca ?? this.data?.position?.dca;
  }

  public state(): PositionState {
    return this.data.state;
  }

  public supplyMint(): PublicKey {
    return toWeb3JsPublicKey(this.state().supply.mint);
  }

  public debtMint(): PublicKey {
    return toWeb3JsPublicKey(this.state().debt.mint);
  }

  public boostToBps() {
    return Math.min(
      this.settings()?.boostToBps ?? 0,
      maxBoostToBps(this.state().maxLtvBps, this.state().liqThresholdBps)
    );
  }

  public boostFromBps() {
    return this.boostToBps() - (this.settings()?.boostGap ?? 0);
  }

  public repayToBps() {
    return Math.min(
      this.settings()?.repayToBps ?? 0,
      maxRepayToBps(this.state().maxLtvBps, this.state().liqThresholdBps)
    );
  }

  public repayFromBps() {
    return (
      (this.settings()?.repayToBps ?? 0) + (this.settings()?.repayGap ?? 0)
    );
  }

  public netWorth() {
    return calcNetWorth(this.state());
  }

  public netWorthUsd() {
    return calcNetWorthUsd(this.state());
  }

  public totalSupply() {
    return calcTotalSupply(this.state());
  }

  public supplyUsd() {
    return calcSupplyUsd(this.state());
  }

  public totalDebt() {
    return calcTotalDebt(this.state());
  }

  public debtUsd() {
    return calcDebtUsd(this.state());
  }

  public supplyLiquidityUsdDepositable() {
    return supplyLiquidityUsdDepositable(this.state());
  }

  public debtLiquidityUsdAvailable() {
    return debtLiquidityUsdAvailable(this.state());
  }

  abstract supplyLiquidityDepositable(): bigint;
  abstract supplyLiquidityAvailable(): bigint;
  abstract debtLiquidityAvailable(): bigint;

  public sufficientLiquidityToBoost() {
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

  public eligibleForRebalance(
    bpsDistanceThreshold = 0
  ): RebalanceAction | undefined {
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

  public eligibleForRefresh(): boolean {
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

  public async updateWithLatestPrices(
    state: PositionState,
    supplyPrice?: number,
    debtPrice?: number
  ) {
    if (!supplyPrice || !debtPrice) {
      [supplyPrice, debtPrice] = await fetchTokenPrices([
        toWeb3JsPublicKey(state.supply.mint),
        toWeb3JsPublicKey(state.debt.mint),
      ]);
    }

    const supplyUsd = this.totalSupply() * supplyPrice;
    const debtUsd = this.totalDebt() * debtPrice;
    this.data.state = {
      ...state,
      liqUtilizationRateBps: getLiqUtilzationRateBps(
        supplyUsd,
        debtUsd,
        state.liqThresholdBps
      ),
      netWorth: {
        baseUnit: toBaseUnit(
          (supplyUsd - debtUsd) / supplyPrice,
          state.supply.decimals
        ),
        baseAmountUsdValue: toRoundedUsdValue(supplyUsd - debtUsd),
      },
      supply: {
        ...state.supply,
        amountCanBeUsed: {
          ...state.supply.amountCanBeUsed,
          baseAmountUsdValue: toRoundedUsdValue(
            fromBaseUnit(
              state.supply.amountCanBeUsed.baseUnit,
              state.supply.decimals
            ) * supplyPrice
          ),
        },
        amountUsed: {
          ...state.supply.amountUsed,
          baseAmountUsdValue: toRoundedUsdValue(supplyUsd),
        },
      },
      debt: {
        ...state.debt,
        amountCanBeUsed: {
          ...state.debt.amountCanBeUsed,
          baseAmountUsdValue: toRoundedUsdValue(
            fromBaseUnit(
              state.debt.amountCanBeUsed.baseUnit,
              state.debt.decimals
            ) * debtPrice
          ),
        },
        amountUsed: {
          ...state.debt.amountUsed,
          baseAmountUsdValue: toRoundedUsdValue(debtUsd),
        },
      },
    };
  }

  async refetchPositionData() {
    this.data = await fetchSolautoPosition(
      this.umi,
      fromWeb3JsPublicKey(this.publicKey)
    );
  }
}
