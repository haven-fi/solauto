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
} from "../utils";
import { getMarginfiAccounts } from "../constants";
import { SolautoPositionEx } from "./solautoPositionEx";

export class MarginfiSolautoPositionEx extends SolautoPositionEx {
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

  async maxLtvAndLiqThresholdBps(): Promise<[number, number]> {
    if (!this.supplyBank || !this.debtBank) {
      const group = (await this.lendingPool()).toString();
      const bankAccounts = getMarginfiAccounts(this.lpEnv).bankAccounts;
      const supplyBank = bankAccounts[group][this.supplyMint().toString()].bank;
      const debtBank = bankAccounts[group][this.debtMint().toString()].bank;

      [this.supplyBank, this.debtBank] = await safeFetchAllBank(this.umi, [
        publicKey(supplyBank),
        publicKey(debtBank),
      ]);
    }

    const [supplyPrice] = await fetchTokenPrices([this.supplyMint()]);
    const [maxLtvBps, liqThresholdBps] = calcMarginfiMaxLtvAndLiqThresholdBps(
      this.supplyBank,
      this.debtBank,
      supplyPrice
    );

    return [maxLtvBps, liqThresholdBps];
  }

  supplyLiquidityAvailable(): number {
    return fromBaseUnit(
      getBankLiquidityAvailableBaseUnit(this.supplyBank, false),
      this.state().supply.decimals
    );
  }

  async refreshPositionState(): Promise<void> {
    if (!this.canRefreshPositionState()) {
      return;
    }

    const useDesignatedMint = !this._data.position || !this._data.selfManaged;
    const resp = await getMarginfiAccountPositionState(
      this.umi,
      { pk: this.lpUserAccount },
      await this.lendingPool(),
      useDesignatedMint
        ? { mint: toWeb3JsPublicKey(this.state().supply.mint) }
        : undefined,
      useDesignatedMint
        ? { mint: toWeb3JsPublicKey(this.state().debt.mint) }
        : undefined,
      this.lpEnv,
      this.contextUpdates
    );

    if (resp) {
      this.supplyBank = resp.supplyBank;
      this.debtBank = resp.debtBank;
      this._data.state = resp.state;
    }
  }
}
