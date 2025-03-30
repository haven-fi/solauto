import { SolautoClient } from "../clients";
import { FlashLoanDetails, TransactionItemInputs } from "../types";
import { maxBoostToBps } from "../utils";
import { getRebalanceValues, RebalanceValues } from "./rebalanceValues";
import { SolautoFeesBps } from "./solautoFees";
import { SolautoRebalanceType } from "../generated";

interface RebalanceDetails {
  values: RebalanceValues;
  flashLoan?: FlashLoanDetails;
  rebalanceType: SolautoRebalanceType;
}

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

  private getRebalanceValues(flFee?: number) {
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

  private signerShouldFlashLoan(values: RebalanceValues, attemptNum: number) {}

  private getRebalanceDetails(attemptNum: number): RebalanceDetails {
    let values = this.getRebalanceValues();

    const maxBoostTo = maxBoostToBps(
      this.client.solautoPosition.state().maxLtvBps,
      this.client.solautoPosition.state().liqThresholdBps
    );

    if (values.intermediaryLiqUtilizationRateBps > maxBoostTo) {
      const signerFlashLoan = this.signerShouldFlashLoan(values, attemptNum);
      const flFeeBps = 0; // TODO
      values = this.getRebalanceValues(flFeeBps);
    } else {
      return {
        values,
        rebalanceType: SolautoRebalanceType.Regular,
      };
    }
  }

  private assembleTransaction() {}

  public async buildRebalanceTx(
    attemptNum: number
  ): Promise<TransactionItemInputs | undefined> {
    if (!this.shouldProceedWithRebalance()) {
      this.client.log("Not eligible for a rebalance");
      return undefined;
    }

    const rebalanceDetails = this.getRebalanceDetails(attemptNum);
  }
}
