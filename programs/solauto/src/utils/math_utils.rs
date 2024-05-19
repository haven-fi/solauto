use fixed::types::I80F48;
use num_traits::{ FromPrimitive, ToPrimitive };
use solend_sdk::math::{ Decimal, WAD };
use std::ops::{ Div, Mul };

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
    let value = base_units.to_f64().unwrap_or(0.0).div(factor);
    V::from_f64(value).unwrap()
}

pub fn to_base_unit<T, U, V>(value: T, decimals: U) -> V
    where T: ToPrimitive, U: Into<u32>, V: FromPrimitive
{
    let factor = (10u64).pow(decimals.into()) as f64;
    let base_units = value.to_f64().unwrap_or(0.0).mul(factor);
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
/// * `adjustment_fee_bps` - Adjustment fee. On boosts this would be the Solauto fee. If deleveraging this would be None
///
/// # Returns
/// The USD value of the debt adjustment. Positive if debt needs to increase, negative if debt needs to decrease. This amount is inclusive of the adjustment fee
///
pub fn calculate_debt_adjustment_usd(
    liq_threshold: f64,
    total_supply_usd: f64,
    total_debt_usd: f64,
    target_liq_utilization_rate_bps: u16,
    adjustment_fee_bps: u16
) -> f64 {
    let adjustment_fee = if adjustment_fee_bps > 0 {
        (adjustment_fee_bps as f64).div(10000.0)
    } else {
        0.0
    };

    let target_liq_utilization_rate = (target_liq_utilization_rate_bps as f64).div(10000.0);

    (target_liq_utilization_rate * total_supply_usd * liq_threshold - total_debt_usd) /
        (1.0 - target_liq_utilization_rate * (1.0 - adjustment_fee) * liq_threshold)
}

pub fn get_maximum_repay_to_bps_param(max_ltv: f64, liq_threshold: f64) -> u16 {
    (max_ltv - 0.01).div(liq_threshold).mul(10000.0) as u16
}

// TODO: test these locally in main.rs

pub fn convert_i80f48_to_u64(value: I80F48) -> u64 {
    let shifted: I80F48 = value >> 48;
    shifted.to_num::<u64>()
}

pub fn convert_i80f48_to_f64(value: I80F48) -> f64 {
    let divisor = I80F48::from_num(1u64 << 48);
    let float_value = value / divisor;
    float_value.to_num::<f64>()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn round_to_places(value: f64, places: u32) -> f64 {
        let multiplier = 10_f64.powi(places as i32);
        (value * multiplier).round() / multiplier
    }

    fn test_debt_adjustment_calculation(mut supply_usd: f64, mut debt_usd: f64, target_liq_utilization_rate: f64) {
        let liq_threshold = 0.8;
        
        let debt_adjustment = calculate_debt_adjustment_usd(
            liq_threshold,
            supply_usd,
            debt_usd,
            target_liq_utilization_rate.mul(10000.0) as u16,
            0
        );

        supply_usd += debt_adjustment;
        debt_usd += debt_adjustment;

        let new_liq_utilization_rate = debt_usd.div(supply_usd.mul(liq_threshold));
        assert!(round_to_places(new_liq_utilization_rate, 2) == round_to_places(target_liq_utilization_rate, 2));
    }

    #[test]
    fn test_debt_adjustment() {
        test_debt_adjustment_calculation(30.0, 24.0, 0.5);
        test_debt_adjustment_calculation(44334.0, 24534.0, 0.5);
        test_debt_adjustment_calculation(7644.0, 434.0, 0.8);
        test_debt_adjustment_calculation(10444.0, 7454.0, 0.2);
        test_debt_adjustment_calculation(1340444.0, 7454.0, 0.35);
        test_debt_adjustment_calculation(1000000.0, 519999.0, 0.65);
    }
}
