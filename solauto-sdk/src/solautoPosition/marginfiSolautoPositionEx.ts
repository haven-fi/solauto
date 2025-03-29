import { PublicKey } from "@solana/web3.js";
import { SolautoPositionEx } from "./solautoPositionEx";
import { Bank, fetchMarginfiAccount, MarginfiAccount } from "../marginfi-sdk";
import { publicKey } from "@metaplex-foundation/umi";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import {
  getBankLiquidityAvailableBaseUnit,
  getMarginfiAccountPositionState,
} from "../utils";
import { DEFAULT_MARGINFI_GROUP } from "../constants";

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

    const useDesignatedMint = !this.data.position || !this.data.selfManaged;
    const resp = await getMarginfiAccountPositionState(
      this.umi,
      { pk: this.lpUserAccount ?? PublicKey.default },
      await this.lendingPool(),
      useDesignatedMint ? { mint: this.supplyMint } : undefined,
      useDesignatedMint ? { mint: this.debtMint } : undefined,
      this.contextUpdates
    );

    if (resp) {
      this.supplyBank = resp?.supplyBank;
      this.debtBank = resp?.debtBank;
      this.data.state = resp?.state;
    }
  }
}
