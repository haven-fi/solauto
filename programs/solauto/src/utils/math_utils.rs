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

pub fn base_unit_to_usd_value(base_unit: u64, decimals: u8, market_price: f64) -> f32 {
    (base_unit as f32).div((10u64).pow(decimals as u32) as f32).mul(market_price as f32)
}
