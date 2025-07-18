import { REFERRER_PERCENTAGE } from "../../constants";
import { RebalanceDirection } from "../../generated";

export class SolautoFeesBps {
  constructor(
    private isReferred: boolean,
    private targetLiqUtilizationRateBps: number | undefined,
    private positionNetWorthUsd: number
  ) {}

  static create(
    isReferred: boolean,
    targetLiqUtilizationRateBps: number | undefined,
    netWorthUsd: number
  ) {
    return new SolautoFeesBps(
      isReferred,
      targetLiqUtilizationRateBps,
      netWorthUsd
    );
  }

  getSolautoFeesBps(rebalanceDirection: RebalanceDirection) {
    const minSize = 10_000; // Minimum position size
    const maxSize = 250_000; // Maximum position size
    const maxFeeBps = 50; // Fee in basis points for minSize (0.5%)
    const minFeeBps = 25; // Fee in basis points for maxSize (0.25%)
    const k = 1.5;

    let feeBps: number = 0;
    if (this.targetLiqUtilizationRateBps !== undefined) {
      if (this.targetLiqUtilizationRateBps === 0) {
        feeBps = 15;
      } else {
        feeBps = 10;
      }
    } else if (rebalanceDirection === RebalanceDirection.Repay) {
      feeBps = 25;
    } else if (this.positionNetWorthUsd <= minSize) {
      feeBps = maxFeeBps;
    } else if (this.positionNetWorthUsd >= maxSize) {
      feeBps = minFeeBps;
    } else {
      const t =
        (Math.log(this.positionNetWorthUsd) - Math.log(minSize)) /
        (Math.log(maxSize) - Math.log(minSize));
      feeBps = Math.round(
        minFeeBps + (maxFeeBps - minFeeBps) * (1 - Math.pow(t, k))
      );
    }

    let referrer = 0;
    if (this.isReferred) {
      feeBps *= 1.0 - REFERRER_PERCENTAGE;
      referrer = Math.floor(feeBps * REFERRER_PERCENTAGE);
    }

    return {
      solauto: feeBps - referrer,
      referrer,
      total: feeBps,
    };
  }
}
