use fixed::types::I80F48;
use num_traits::{FromPrimitive, ToPrimitive};
use std::{
    cmp::min,
    ops::{Div, Mul},
};

use crate::constants::{MAX_BASIS_POINTS, MIN_REPAY_GAP_BPS, USD_DECIMALS};

#[inline(always)]
pub fn from_base_unit<T, U, V>(base_units: T, decimals: U) -> V
where
    T: ToPrimitive,
    U: Into<u32>,
    V: FromPrimitive,
{
    let factor = (10u64).pow(decimals.into()) as f64;
    let value = base_units.to_f64().unwrap_or(0.0).div(factor);
    V::from_f64(value).unwrap()
}

#[inline(always)]
pub fn to_base_unit<T: std::fmt::Display, U: std::fmt::Display, V>(value: T, decimals: U) -> V
where
    T: ToPrimitive,
    U: Into<u32>,
    V: FromPrimitive,
{
    let factor = (10u64).pow(decimals.into()) as f64;
    let base_units = value.to_f64().unwrap_or(0.0).mul(factor);
    V::from_f64(base_units).unwrap()
}

#[inline(always)]
pub fn base_unit_to_usd_value(base_unit: u64, decimals: u8, market_price: f64) -> f64 {
    (base_unit as f64)
        .div((10u64).pow(decimals as u32) as f64)
        .mul(market_price)
}

#[inline(always)]
pub fn from_bps(value_bps: u16) -> f64 {
    (value_bps as f64).div(MAX_BASIS_POINTS as f64)
}

#[inline(always)]
pub fn to_bps(value: f64) -> u16 {
    value.mul(MAX_BASIS_POINTS as f64) as u16
}

#[inline(always)]
pub fn i80f48_to_u64(value: I80F48) -> u64 {
    value.to_num::<u64>()
}

#[inline(always)]
pub fn i80f48_to_f64(value: I80F48) -> f64 {
    return value.to_num();
}

#[inline(always)]
pub fn get_liq_utilization_rate_bps(supply_usd: f64, debt_usd: f64, liq_threshold: f64) -> u16 {
    if supply_usd == 0.0 {
        return 0;
    }

    to_bps(debt_usd.div(supply_usd.mul(liq_threshold)))
}

#[inline(always)]
pub fn net_worth_usd_base_amount(supply_usd: f64, debt_usd: f64) -> u64 {
    to_base_unit::<f64, u8, u64>(supply_usd - debt_usd, USD_DECIMALS)
}

#[inline(always)]
pub fn net_worth_base_amount(
    supply_usd: f64,
    debt_usd: f64,
    supply_market_price: f64,
    supply_decimals: u8,
) -> u64 {
    let supply_net_worth = from_base_unit::<u64, u8, f64>(
        net_worth_usd_base_amount(supply_usd, debt_usd),
        USD_DECIMALS,
    )
    .div(supply_market_price as f64);
    to_base_unit::<f64, u8, u64>(supply_net_worth, supply_decimals)
}

/// Calculates the debt adjustment in USD in order to reach the target_liq_utilization_rate
///
/// # Parameters
/// * `liq_threshold` - The liquidation threshold of the supplied asset
/// * `total_supply_usd` - Total USD value of supplied asset
/// * `total_debt_usd` - Total USD value of debt asset
/// * `target_liq_utilization_rate_bps` - Target utilization rate
/// * `adjustment_fee_bps` - Adjustment fee. On boosts this would be the Solauto fee. If deleveraging this would be None
///
/// # Returns
/// The USD value of the debt adjustment. Positive if debt needs to increase, negative if debt needs to decrease. This amount is inclusive of the adjustment fee
///
pub fn get_std_debt_adjustment_usd(
    liq_threshold: f64,
    total_supply_usd: f64,
    total_debt_usd: f64,
    target_liq_utilization_rate_bps: u16,
    adjustment_fee_bps: u16,
) -> f64 {
    let adjustment_fee = if adjustment_fee_bps > 0 {
        from_bps(adjustment_fee_bps)
    } else {
        0.0
    };

    let target_liq_utilization_rate = from_bps(target_liq_utilization_rate_bps);

    (target_liq_utilization_rate * total_supply_usd * liq_threshold - total_debt_usd)
        / (1.0 - target_liq_utilization_rate * (1.0 - adjustment_fee) * liq_threshold)
}

#[inline(always)]
pub fn get_max_liq_utilization_rate_bps(
    max_ltv_bps: u16,
    liq_threshold_bps: u16,
    offset_from_max_ltv: f64,
) -> u16 {
    let val = (from_bps(max_ltv_bps) - offset_from_max_ltv).div(from_bps(liq_threshold_bps));
    to_bps(val)
}

#[inline(always)]
pub fn get_max_repay_from_bps(max_ltv_bps: u16, liq_threshold_bps: u16) -> u16 {
    min(
        9000,
        get_max_liq_utilization_rate_bps(max_ltv_bps, liq_threshold_bps - 1000, 0.0075),
    )
}

#[inline(always)]
pub fn get_max_repay_to_bps(max_ltv_bps: u16, liq_threshold_bps: u16) -> u16 {
    min(
        get_max_repay_from_bps(max_ltv_bps, liq_threshold_bps) - MIN_REPAY_GAP_BPS,
        get_max_liq_utilization_rate_bps(max_ltv_bps, liq_threshold_bps, 0.0075),
    )
}

#[inline(always)]
pub fn get_max_boost_to_bps(max_ltv_bps: u16, liq_threshold_bps: u16) -> u16 {
    min(
        get_max_repay_to_bps(max_ltv_bps, liq_threshold_bps),
        get_max_liq_utilization_rate_bps(max_ltv_bps, liq_threshold_bps, 0.01),
    )
}

#[cfg(test)]
mod tests {
    use std::ops::Sub;

    use super::*;

    fn round_to_places(value: f64, places: u32) -> f64 {
        let multiplier = (10_f64).powi(places as i32);
        (value * multiplier).round() / multiplier
    }

    fn test_debt_adjustment_calculation(
        mut supply_usd: f64,
        mut debt_usd: f64,
        target_liq_utilization_rate: f64,
    ) {
        let supply_weight = 0.899999976158142;
        let debt_weight = 1.100000023841858;
        let liq_threshold = supply_weight.div(debt_weight); // ~0.81

        let debt_adjustment = get_std_debt_adjustment_usd(
            liq_threshold,
            supply_usd,
            debt_usd,
            to_bps(target_liq_utilization_rate),
            0,
        );

        supply_usd += debt_adjustment;
        debt_usd += debt_adjustment;

        let new_liq_utilization_rate_bps =
            get_liq_utilization_rate_bps(supply_usd, debt_usd, liq_threshold);
        assert!(
            round_to_places(from_bps(new_liq_utilization_rate_bps), 2)
                == round_to_places(target_liq_utilization_rate, 2)
        );

        let marginfi_liq_utilization_rate = (1.0).sub(
            supply_usd
                .mul(supply_weight)
                .sub(debt_usd.mul(debt_weight))
                .div(supply_usd.mul(supply_weight)),
        );

        assert!(
            round_to_places(marginfi_liq_utilization_rate, 4)
                == round_to_places(target_liq_utilization_rate, 4)
        );
    }
    #[test]
    fn test_std_debt_adjustment() {
        test_debt_adjustment_calculation(100.0, 80.0, 0.8);
        test_debt_adjustment_calculation(30.0, 24.0, 0.5);
        test_debt_adjustment_calculation(44334.0, 24534.0, 0.5);
        test_debt_adjustment_calculation(7644.0, 434.0, 0.8);
        test_debt_adjustment_calculation(10444.0, 7454.0, 0.2);
        test_debt_adjustment_calculation(1340444.0, 7454.0, 0.35);
        test_debt_adjustment_calculation(1000000.0, 519999.0, 0.65);
    }
}
