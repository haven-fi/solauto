use std::ops::{ Add, Div, Mul, Sub };
use solana_program::program_error::ProgramError;
use solend_sdk::math::{ Decimal, WAD };
use num_traits::{ FromPrimitive, Signed, ToPrimitive };

use crate::constants::SOLAUTO_BOOST_FEE_BPS;

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

pub fn base_unit_to_usd_value(base_unit: u64, decimals: u8, market_price: f64) -> f32 {
    (base_unit as f32).div((10u64).pow(decimals as u32) as f32).mul(market_price as f32)
}

pub fn calculate_debt_adjustment_usd(
    open_ltv: f64,
    total_supply_usd: f64,
    total_debt_usd: f64,
    target_utilization_rate_bps: u16,
    adjustment_fee_bps: Option<u16>
) -> (f64, f64) {
    let adjustment_fee = if !adjustment_fee_bps.is_none() {
        (adjustment_fee_bps.unwrap() as f64).div(10000.0)
    } else {
        0.0
    };

    let current_utilization_rate = total_debt_usd.div(total_supply_usd.mul(open_ltv));
    let target_utilization_rate = (target_utilization_rate_bps as f64).div(10000.0);

    let debt_adjustment_usd = if current_utilization_rate > target_utilization_rate {
        total_debt_usd
            .mul(-1.0)
            .add(open_ltv.mul(total_supply_usd).mul(target_utilization_rate))
            .div(
                open_ltv
                    .mul(target_utilization_rate)
                    .mul(adjustment_fee)
                    .add(open_ltv.mul(target_utilization_rate).add(adjustment_fee).sub(1.0))
            )
    } else {
        total_debt_usd
            .mul(-1.0)
            .add(open_ltv.mul(total_supply_usd).mul(target_utilization_rate))
            .div(
                open_ltv
                    .mul(target_utilization_rate)
                    .mul(adjustment_fee)
                    .sub(open_ltv.mul(target_utilization_rate).add(adjustment_fee).add(1.0))
            )
    };

    let adjustment_fee_usd = debt_adjustment_usd.mul(adjustment_fee);

    (debt_adjustment_usd, adjustment_fee_usd)
}
