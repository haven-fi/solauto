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
import { getDebtAdjustment } from "../rebalance";
import { MIN_POSITION_STATE_FRESHNESS_SECS } from "../constants";
import {
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";

export interface PositionCustomArgs {
  lendingPlatform: LendingPlatform;
  supplyMint: PublicKey;
  debtMint: PublicKey;
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

  public supplyMint!: PublicKey;
  public debtMint!: PublicKey;
  protected lp?: PublicKey = undefined;
  public lpUserAccount?: PublicKey = undefined;

  constructor(args: PositionExArgs) {
    this.umi = args.umi;
    this.publicKey = args.publicKey;
    this.contextUpdates = args.contextUpdates;

    this.supplyMint =
      args.customArgs?.supplyMint ??
      toWeb3JsPublicKey(args.data!.state.supply.mint);
    this.debtMint =
      args.customArgs?.debtMint ??
      toWeb3JsPublicKey(args.data!.state.debt.mint);
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

  abstract supplyLiquidityDepositable(): bigint;
  abstract supplyLiquidityAvailable(): bigint;
  abstract debtLiquidityAvailable(): bigint;

  public supplyUsd() {
    return calcSupplyUsd(this.state());
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

  public sufficientLiquidityToBoost() {
    const limitsUpToDate =
      this.debtLiquidityUsdAvailable() > 0 ||
      this.supplyLiquidityUsdDepositable() > 0;

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

  async refetchPositionData() {
    this.data = await fetchSolautoPosition(
      this.umi,
      fromWeb3JsPublicKey(this.publicKey)
    );
  }
}
