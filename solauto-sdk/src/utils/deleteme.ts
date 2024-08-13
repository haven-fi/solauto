import { getDebtAdjustmentUsd, getLiqUtilzationRateBps } from "./numberUtils";

// TODO delete this file
async function check() {
  let supply = 458948;
  let debt = 212846;
  let supply_weight = 0.899999976158142;
  let debt_weight = 1.100000023841858;
  let liq_threshold = (supply_weight / debt_weight) * 10000;

  console.log(liq_threshold);
  let liq_utilization_rate = getLiqUtilzationRateBps(
    supply,
    debt,
    liq_threshold
  );
  console.log!(liq_utilization_rate);

  let debt_adjustment_usd = getDebtAdjustmentUsd(
    liq_threshold,
    supply,
    debt,
    6000,
    0
  );

  supply += debt_adjustment_usd;
  debt += debt_adjustment_usd;

  liq_utilization_rate = getLiqUtilzationRateBps(
    supply,
    debt,
    liq_threshold
  );

  console.log(debt_adjustment_usd);
  console.log!(liq_utilization_rate);
}

check();
