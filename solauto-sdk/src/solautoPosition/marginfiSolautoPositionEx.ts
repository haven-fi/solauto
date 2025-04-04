import { PublicKey } from "@solana/web3.js";
import { SolautoPositionEx } from "./solautoPositionEx";
import {
  Bank,
  fetchMarginfiAccount,
  MarginfiAccount,
  safeFetchAllBank,
} from "../marginfi-sdk";
import { publicKey } from "@metaplex-foundation/umi";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import {
  calcMarginfiMaxLtvAndLiqThreshold,
  fetchTokenPrices,
  getBankLiquidityAvailableBaseUnit,
  getMarginfiAccountPositionState,
  toBps,
} from "../utils";
import { DEFAULT_MARGINFI_GROUP, MARGINFI_ACCOUNTS } from "../constants";

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
      this.lp = new PublicKey(DEFAULT_MARGINFI_GROUP);
    }

    return this.lp;
  }

  async maxLtvAndLiqThresholdBps(): Promise<[number, number]> {
    if (!this.supplyBank || !this.debtBank) {
      const group = (await this.lendingPool()).toString();
      const supplyBank =
        MARGINFI_ACCOUNTS[group][this.supplyMint().toString()].bank;
      const debtBank =
        MARGINFI_ACCOUNTS[group][this.debtMint().toString()].bank;

      [this.supplyBank, this.debtBank] = await safeFetchAllBank(this.umi, [
        publicKey(supplyBank),
        publicKey(debtBank),
      ]);
    }

    const [supplyPrice] = await fetchTokenPrices([this.supplyMint()]);
    const [maxLtv, liqThreshold] = calcMarginfiMaxLtvAndLiqThreshold(
      this.supplyBank,
      this.debtBank,
      supplyPrice
    );

    return [toBps(maxLtv), toBps(liqThreshold)];
  }

  supplyLiquidityAvailable(): bigint {
    return getBankLiquidityAvailableBaseUnit(this.supplyBank, false);
  }

  supplyLiquidityDepositable(): bigint {
    return getBankLiquidityAvailableBaseUnit(this.supplyBank, true);
  }

  debtLiquidityAvailable(): bigint {
    return getBankLiquidityAvailableBaseUnit(this.debtBank, false);
  }

  async refreshPositionState(): Promise<void> {
    if (!this.canRefreshPositionState()) {
      return;
    }

    const useDesignatedMint = !this._data.position || !this._data.selfManaged;
    const resp = await getMarginfiAccountPositionState(
      this.umi,
      { pk: this.lpUserAccount ?? PublicKey.default },
      await this.lendingPool(),
      useDesignatedMint
        ? { mint: toWeb3JsPublicKey(this.state().supply.mint) }
        : undefined,
      useDesignatedMint
        ? { mint: toWeb3JsPublicKey(this.state().debt.mint) }
        : undefined,
      this.contextUpdates
    );

    if (resp) {
      this.supplyBank = resp.supplyBank;
      this.debtBank = resp.debtBank;
      this._data.state = resp.state;
    }
  }
}
