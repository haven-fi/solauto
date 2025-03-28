export function sufficientLiquidityToBoost(
  solautoPosition: SolautoPosition,
  supplyMintPrice: number,
  debtMintPrice: number
) {
  const debtAvailable = debtLiquidityUsdAvailable(solautoPosition.state);
  const supplyDepositable = supplyLiquidityUsdDepositable(
    solautoPosition.state
  );

  const limitsUpToDate = debtAvailable > 0 || supplyDepositable > 0;

  if (limitsUpToDate) {
    const values = getRebalanceValues(
      solautoPosition,
      currentUnixSeconds(),
      supplyMintPrice,
      debtMintPrice
    );

    const sufficientLiquidity =
      debtAvailable * 0.95 > values.debtAdjustmentUsd &&
      supplyDepositable * 0.95 > values.debtAdjustmentUsd;

    if (!sufficientLiquidity) {
      consoleLog("Insufficient liquidity to further boost");
    }
    return sufficientLiquidity;
  }

  return true;
}

export function eligibleForRebalance(
  solautoPosition: SolautoPosition,
  supplyMintPrice: number,
  debtMintPrice: number,
  bpsDistanceThreshold = 0
): RebalanceAction | undefined {
  if (
    !solautoPosition.position.settingParams ||
    !calcSupplyUsd(solautoPosition.state)
  ) {
    return undefined;
  }

  const settings = solautoPosition.position.settingParams;
  const boostToBps = settings.boostToBps;
  const repayFrom = settings.repayToBps + settings.repayGap;
  const boostFrom = boostToBps - settings.boostGap;

  if (
    solautoPosition.state.liqUtilizationRateBps - boostFrom <=
    bpsDistanceThreshold
  ) {
    const sufficientLiquidity = sufficientLiquidityToBoost(
      solautoPosition,
      supplyMintPrice,
      debtMintPrice
    );
    return sufficientLiquidity ? "boost" : undefined;
  } else if (
    repayFrom - solautoPosition.state.liqUtilizationRateBps <=
    bpsDistanceThreshold
  ) {
    return "repay";
  }

  return undefined;
}
