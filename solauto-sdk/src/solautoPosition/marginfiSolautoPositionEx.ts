import { PublicKey } from "@solana/web3.js";
import { SolautoPositionEx } from "./solautoPositionEx";
import { Bank, fetchMarginfiAccount, MarginfiAccount } from "../marginfi-sdk";
import { publicKey } from "@metaplex-foundation/umi";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { getBankLiquidityAvailableBaseUnit } from "../utils";

export class MarginfiSolautoPositionEx extends SolautoPositionEx {
  private marginfiAccountData: MarginfiAccount | null = null;
  private supplyBank: Bank | null = null;
  private debtBank: Bank | null = null;

  public async lendingPool(): Promise<PublicKey> {
    if (!this.marginfiAccountData) {
      this.marginfiAccountData = await fetchMarginfiAccount(
        this.umi,
        publicKey(this.data.position.protocolUserAccount),
        { commitment: "confirmed" }
      );
    }
    return toWeb3JsPublicKey(this.marginfiAccountData.group);
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
}
