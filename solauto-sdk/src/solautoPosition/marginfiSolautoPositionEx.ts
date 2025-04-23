import { PublicKey } from "@solana/web3.js";
import { Bank, PriceBias, safeFetchAllBank } from "../marginfi-sdk";
import { publicKey } from "@metaplex-foundation/umi";
import {
  calcMarginfiMaxLtvAndLiqThresholdBps,
  fetchTokenPrices,
  fromBaseUnit,
  getBankLiquidityAvailableBaseUnit,
  getBankLiquidityUsedBaseUnit,
  getMarginfiAccountPositionState,
  getMarginfiPriceOracle,
  safeGetPrice,
  tokenInfo,
  toRoundedUsdValue,
  validPubkey,
} from "../utils";
import { getMarginfiAccounts } from "../constants";
import { SolautoPositionEx } from "./solautoPositionEx";
import { LendingPlatform, PriceType } from "../generated";

export class MarginfiSolautoPositionEx extends SolautoPositionEx {
  lendingPlatform = LendingPlatform.Marginfi;
  maxLtvPriceType = PriceType.Ema;

  public supplyBank: Bank | null = null;
  public debtBank: Bank | null = null;

  supplyPrice(priceType?: PriceType): number | undefined {
    return (
      this._supplyPrice ??
      safeGetPrice(this.supplyMint, priceType, PriceBias.Low)
    );
  }

  debtPrice(priceType?: PriceType): number | undefined {
    return (
      this._debtPrice ?? safeGetPrice(this.debtMint, priceType, PriceBias.High)
    );
  }

  private getBankAccounts(mint: PublicKey) {
    const group = this.lpPoolAccount.toString();
    const bankAccounts = getMarginfiAccounts(this.lpEnv).bankAccounts;
    return bankAccounts[group][mint.toString()];
  }

  async getBanks(): Promise<Bank[]> {
    if (!this.supplyBank || !this.debtBank) {
      [this.supplyBank, this.debtBank] = await safeFetchAllBank(this.umi, [
        publicKey(this.lpSupplyAccount),
        publicKey(this.lpDebtAccount),
      ]);
    }

    return [this.supplyBank!, this.debtBank!];
  }

  async priceOracles(): Promise<PublicKey[]> {
    const [supplyBank, debtBank] = await this.getBanks();

    return await Promise.all([
      getMarginfiPriceOracle(this.umi, { data: supplyBank }),
      getMarginfiPriceOracle(this.umi, { data: debtBank }),
    ]);
  }

  async maxLtvAndLiqThresholdBps(): Promise<[number, number]> {
    const [supplyBank, debtBank] = await this.getBanks();

    const [supplyPrice] = await fetchTokenPrices([this.supplyMint]);
    const [maxLtvBps, liqThresholdBps] = calcMarginfiMaxLtvAndLiqThresholdBps(
      supplyBank,
      debtBank,
      supplyPrice
    );

    return [maxLtvBps, liqThresholdBps];
  }

  private getUpToDateLiquidityAvailable(
    banks: Bank[],
    mint: PublicKey,
    availableToDeposit: boolean
  ) {
    const bank = banks.find(
      (x) =>
        x.group.toString() === this.lpPoolAccount.toString() &&
        x.mint.toString() === mint.toString()
    );

    const baseUnit = getBankLiquidityAvailableBaseUnit(
      bank!,
      availableToDeposit
    );
    return {
      baseUnit: baseUnit,
      baseAmountUsdValue: toRoundedUsdValue(
        fromBaseUnit(baseUnit, tokenInfo(mint).decimals) *
          (safeGetPrice(mint) ?? 0)
      ),
    };
  }

  updateSupplyLiquidityDepositable(banks: Bank[]) {
    this._data.state.supply.amountCanBeUsed =
      this.getUpToDateLiquidityAvailable(banks, this.supplyMint, true);
  }

  updateDebtLiquidityAvailable(banks: Bank[]) {
    this._data.state.debt.amountCanBeUsed = this.getUpToDateLiquidityAvailable(
      banks,
      this.debtMint,
      false
    );
  }

  get lpSupplyAccount() {
    return new PublicKey(this.getBankAccounts(this.supplyMint).bank);
  }

  get lpDebtAccount() {
    return new PublicKey(this.getBankAccounts(this.debtMint).bank);
  }

  get supplyLiquidityAvailable(): number {
    return fromBaseUnit(
      getBankLiquidityAvailableBaseUnit(this.supplyBank, false),
      this.supplyMintInfo.decimals
    );
  }

  get supplyUsdWithdrawable(): number {
    const deposits = fromBaseUnit(
      getBankLiquidityUsedBaseUnit(this.supplyBank, true),
      this.supplyMintInfo.decimals
    );
    const borrows = fromBaseUnit(
      getBankLiquidityAvailableBaseUnit(this.supplyBank, false),
      this.supplyMintInfo.decimals
    );
    return Math.min((deposits - borrows), this.totalSupply) * this.supplyPrice()!;
  }

  async refreshPositionState(priceType?: PriceType): Promise<void> {
    if (!this.canRefreshPositionState()) {
      return;
    }

    const useDesignatedMint =
      !this.exists ||
      !this.selfManaged ||
      (this.selfManaged && !validPubkey(this.lpUserAccount));

    const resp = await getMarginfiAccountPositionState(
      this.umi,
      { pk: this.lpUserAccount },
      this._lpPoolAccount,
      useDesignatedMint ? { mint: this.supplyMint } : undefined,
      useDesignatedMint ? { mint: this.debtMint } : undefined,
      this.contextUpdates,
      priceType
    );

    if (resp) {
      this.supplyBank = resp.supplyBank;
      this.debtBank = resp.debtBank;
      this._lpPoolAccount = resp.marginfiGroup;
      this._data.state = resp.state;
    }
  }
}
