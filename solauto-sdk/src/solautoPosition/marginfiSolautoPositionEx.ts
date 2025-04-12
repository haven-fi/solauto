import { PublicKey } from "@solana/web3.js";
import {
  Bank,
  fetchMarginfiAccount,
  MarginfiAccount,
  safeFetchAllBank,
} from "../marginfi-sdk";
import { publicKey } from "@metaplex-foundation/umi";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import {
  calcMarginfiMaxLtvAndLiqThresholdBps,
  fetchTokenPrices,
  fromBaseUnit,
  getBankLiquidityAvailableBaseUnit,
  getMarginfiAccountPositionState,
  getMarginfiPriceOracle,
} from "../utils";
import { getMarginfiAccounts } from "../constants";
import { SolautoPositionEx } from "./solautoPositionEx";
import { LendingPlatform, PriceType } from "../generated";

export class MarginfiSolautoPositionEx extends SolautoPositionEx {
  lendingPlatform = LendingPlatform.Marginfi;

  private marginfiAccountData: MarginfiAccount | null = null;
  private supplyBank: Bank | null = null;
  private debtBank: Bank | null = null;

  public async lendingPool(): Promise<PublicKey> {
    if (this.lp) {
      return this.lp;
    }

    if (
      !this.marginfiAccountData &&
      this.lpUserAccount &&
      !this.lpUserAccount.equals(PublicKey.default)
    ) {
      this.marginfiAccountData = await fetchMarginfiAccount(
        this.umi,
        publicKey(this.lpUserAccount),
        { commitment: "confirmed" }
      );
      this.lp = toWeb3JsPublicKey(this.marginfiAccountData.group);
    }

    if (!this.lp) {
      this.lp = getMarginfiAccounts(this.lpEnv).defaultGroup;
    }

    return this.lp;
  }

  async getBanks(): Promise<Bank[]> {
    if (!this.supplyBank || !this.debtBank) {
      const group = (await this.lendingPool()).toString();
      const bankAccounts = getMarginfiAccounts(this.lpEnv).bankAccounts;
      const supplyBank = bankAccounts[group][this.supplyMint.toString()].bank;
      const debtBank = bankAccounts[group][this.debtMint.toString()].bank;

      [this.supplyBank, this.debtBank] = await safeFetchAllBank(this.umi, [
        publicKey(supplyBank),
        publicKey(debtBank),
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

  get supplyLiquidityAvailable(): number {
    return fromBaseUnit(
      getBankLiquidityAvailableBaseUnit(this.supplyBank, false),
      this.supplyMintInfo.decimals
    );
  }

  async refreshPositionState(priceType?: PriceType): Promise<void> {
    const useDesignatedMint = !this._data.position || !this.selfManaged;
    const resp = await getMarginfiAccountPositionState(
      this.umi,
      { pk: this.lpUserAccount },
      await this.lendingPool(),
      useDesignatedMint ? { mint: this.supplyMint } : undefined,
      useDesignatedMint ? { mint: this.debtMint } : undefined,
      this.lpEnv,
      this.contextUpdates,
      priceType
    );

    if (resp) {
      this.supplyBank = resp.supplyBank;
      this.debtBank = resp.debtBank;
      this._data.state = resp.state;
    }
  }
}
