import { SolautoClient } from "../clients";
import { TransactionItemInputs } from "../types";
import { getRebalanceValues } from "./rebalanceValues";
import { SolautoFeesBps } from "./solautoFees";

export class RebalanceTxBuilder {
  constructor(
    private client: SolautoClient,
    private targetLiqUtilizationRateBps?: number
  ) {}

  private async shouldProceedWithRebalance() {
    await this.client.solautoPosition.refreshPositionState();

    return (
      this.client.solautoPosition.supplyUsd() > 0 &&
      (this.targetLiqUtilizationRateBps !== undefined ||
        this.client.solautoPosition.eligibleForRebalance())
    );
  }

  private rebalanceValues(flFee?: number) {
    return getRebalanceValues(
      this.client.solautoPosition,
      new SolautoFeesBps(
        this.client.isReferred(),
        this.targetLiqUtilizationRateBps,
        this.client.solautoPosition.netWorthUsd()
      ),
      flFee ?? 0,
      this.targetLiqUtilizationRateBps
    );
  }

  private assembleTransaction() {}

  public async buildRebalanceTx(
    attemptNum?: number
  ): Promise<TransactionItemInputs | undefined> {
    if (!this.shouldProceedWithRebalance()) {
      this.client.log("Not eligible for a rebalance");
      return undefined;
    }
  }
}
