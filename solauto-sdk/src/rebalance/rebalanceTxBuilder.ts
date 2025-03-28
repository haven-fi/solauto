import { SolautoClient } from "../clients";

export class RebalanceTxBuilder {
  constructor(private client: SolautoClient) {}

  public buildRebalanceTx(
    targetLiqUtilizationRateBps?: number,
    attemptNum?: number
  ) {}
}
