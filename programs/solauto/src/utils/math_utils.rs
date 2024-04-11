use std::ops::{ Div, Mul };
use solend_sdk::math::{ Decimal, WAD };
use num_traits::{ FromPrimitive, ToPrimitive };

pub fn decimal_to_f64(decimal: Decimal) -> f64 {
    u128::try_from(decimal.0).unwrap() as f64
}

pub fn decimal_to_f64_div_wad(decimal: Decimal) -> f64 {
    decimal_to_f64(decimal) / (WAD as f64)
}

pub fn from_base_unit<T, U, V>(base_units: T, decimals: U) -> V
    where T: ToPrimitive, U: Into<u32>, V: FromPrimitive
{
    let factor = (10u64).pow(decimals.into()) as f64;
    let value = base_units.to_f64().unwrap_or(0.0) / factor;
    V::from_f64(value).unwrap()
}

pub fn to_base_unit<T, U, V>(value: T, decimals: U) -> V
    where T: ToPrimitive, U: Into<u32>, V: FromPrimitive
{
    let factor = (10u64).pow(decimals.into()) as f64;
    let base_units = value.to_f64().unwrap_or(0.0) * factor;
    V::from_f64(base_units).unwrap()
}

pub fn base_unit_to_usd_value(base_unit: u64, decimals: u8, market_price: f64) -> f64 {
    (base_unit as f64).div((10u64).pow(decimals as u32) as f64).mul(market_price)
}

/// Calculates the debt adjustment in USD in order to reach the target_liq_utilization_rate
///
/// # Parameters
/// * `liq_threshold` - The liquidation threshold of the supplied asset
/// * `total_supply_usd` - Total USD value of supplied asset
/// * `total_debt_usd` - Total USD value of debt asset
/// * `target_liq_utilization_rate_bps` - Target utilization rate
/// * `adjustment_fee_bps` - Adjustment fee. On boosts this would be the Solauto fee. If deleveraging and using a flash loan, this would be the flash loan fee
///
/// # Returns
/// The USD value of the debt adjustment. Positive if debt needs to increase, negative if debt needs to decrease. This amount is inclusive of the adjustment fee
///
pub fn calculate_debt_adjustment_usd(
    liq_threshold: f64,
    total_supply_usd: f64,
    total_debt_usd: f64,
    target_liq_utilization_rate_bps: u16,
    adjustment_fee_bps: Option<u16>
) -> f64 {
    let adjustment_fee = if !adjustment_fee_bps.is_none() {
        (adjustment_fee_bps.unwrap() as f64).div(10000.0)
    } else {
        0.0
    };

    let target_liq_utilization_rate = (target_liq_utilization_rate_bps as f64).div(10000.0);

    (target_liq_utilization_rate * total_supply_usd * liq_threshold - total_debt_usd) /
        (1.0 - target_liq_utilization_rate * (1.0 - adjustment_fee) * liq_threshold)
}
