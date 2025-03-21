use fixed::types::I80F48;
use num_traits::{ FromPrimitive, ToPrimitive };
use std::{ cmp::min, ops::{ Add, Div, Mul, Sub } };

use crate::constants::{ MAX_BASIS_POINTS, MIN_REPAY_GAP_BPS, USD_DECIMALS };

#[inline(always)]
pub fn from_base_unit<T, U, V>(base_units: T, decimals: U) -> V
    where T: ToPrimitive, U: Into<u32>, V: FromPrimitive
{
    let factor = (10u64).pow(decimals.into()) as f64;
    let value = base_units.to_f64().unwrap_or(0.0).div(factor);
    V::from_f64(value).unwrap()
}

#[inline(always)]
pub fn to_base_unit<T, U, V>(value: T, decimals: U) -> V
    where T: ToPrimitive, U: Into<u32>, V: FromPrimitive
{
    let factor = (10u64).pow(decimals.into()) as f64;
    let base_units = value.to_f64().unwrap_or(0.0) * factor;
    let adjusted = if base_units < 0.0 { 0.0 } else { base_units };
    V::from_f64(adjusted).unwrap_or_else(|| V::from_f64(0.0).unwrap())
}

#[inline(always)]
pub fn to_rounded_usd_value(usd_value: f64) -> u64 {
    to_base_unit::<f64, u8, u64>(usd_value, USD_DECIMALS)
}

#[inline(always)]
pub fn from_rounded_usd_value(usd_value: u64) -> f64 {
    from_base_unit::<u64, u8, f64>(usd_value, USD_DECIMALS)
}

#[inline(always)]
pub fn base_unit_to_usd_value(base_unit: u64, decimals: u8, market_price: f64) -> f64 {
    (base_unit as f64).div((10u64).pow(decimals as u32) as f64).mul(market_price)
}

#[inline(always)]
pub fn usd_value_to_base_unit(usd_value: f64, decimals: u8, market_price: f64) -> u64 {
    to_base_unit::<f64, u8, u64>(usd_value.abs().div(market_price), decimals)
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
    supply_decimals: u8
) -> u64 {
    let supply_net_worth = from_base_unit::<u64, u8, f64>(
        net_worth_usd_base_amount(supply_usd, debt_usd),
        USD_DECIMALS
    ).div(supply_market_price as f64);
    to_base_unit::<f64, u8, u64>(supply_net_worth, supply_decimals)
}

#[inline(always)]
pub fn get_max_liq_utilization_rate_bps(
    max_ltv_bps: u16,
    liq_threshold_bps: u16,
    offset_from_max_ltv: f64
) -> u16 {
    let val = (from_bps(max_ltv_bps) - offset_from_max_ltv).div(from_bps(liq_threshold_bps));
    to_bps(val)
}

#[inline(always)]
pub fn get_max_repay_from_bps(max_ltv_bps: u16, liq_threshold_bps: u16) -> u16 {
    min(8700, get_max_liq_utilization_rate_bps(max_ltv_bps, liq_threshold_bps - 1000, 0.01))
}

#[inline(always)]
pub fn get_max_repay_to_bps(max_ltv_bps: u16, liq_threshold_bps: u16) -> u16 {
    min(
        get_max_repay_from_bps(max_ltv_bps, liq_threshold_bps) - MIN_REPAY_GAP_BPS,
        get_max_liq_utilization_rate_bps(max_ltv_bps, liq_threshold_bps, 0.01)
    )
}

#[inline(always)]
pub fn get_max_boost_to_bps(max_ltv_bps: u16, liq_threshold_bps: u16) -> u16 {
    min(
        get_max_repay_to_bps(max_ltv_bps, liq_threshold_bps),
        get_max_liq_utilization_rate_bps(max_ltv_bps, liq_threshold_bps, 0.01)
    )
}

#[inline(always)]
pub fn calc_fee_amount(value: u64, fee_pct_bps: u16) -> u64 {
    (value as f64).mul(from_bps(fee_pct_bps)) as u64
}

/// Calculates the debt adjustment in USD in order to reach the target_liq_utilization_rate
///
/// # Parameters
/// * `liq_threshold` - The liquidation threshold of the supplied asset
/// * `supply_usd` - Total USD value of supplied asset
/// * `total_debt_usd` - Total USD value of debt asset
/// * `target_liq_utilization_rate_bps` - Target utilization rate
/// * `solauto_fee_bps` - Solauto fee taken
/// * `lp_fee_bps` - Lending platform fee taken
///
/// # Returns
/// The USD value of the debt adjustment. Positive if debt needs to increase, negative if debt needs to decrease. This amount is inclusive of the adjustment fee
///
pub fn get_debt_adjustment_usd(
    liq_threshold: f64,
    supply_usd: f64,
    debt_usd: f64,
    target_liq_utilization_rate_bps: u16,
    solauto_fee_bps: u16,
    lp_fee_bps: u16
) -> f64 {
    let boosting =
        get_liq_utilization_rate_bps(supply_usd, debt_usd, liq_threshold) <
        target_liq_utilization_rate_bps;

    // let t = from_bps(target_liq_utilization_rate_bps) * liq_threshold;
    // if boosting {
    //     (t * supply_usd - debt_usd) /
    //         (1.0 + from_bps(lp_fee_bps) - t * (1.0 - from_bps(solauto_fee_bps)))
    // } else {
    //     (t * supply_usd - debt_usd) / (t - (1.0 - from_bps(solauto_fee_bps)))
    // }

    // --

    // let target_ratio = from_bps(target_liq_utilization_rate_bps) / liq_threshold;
    // let d = debt_usd - target_ratio * supply_usd;

    // if d < 0.0 {
    //     d.abs() / (1.0 + from_bps(lp_fee_bps) - target_ratio * (1.0 - from_bps(solauto_fee_bps)))
    // } else {
    //     d / (1.0 - from_bps(solauto_fee_bps) - target_ratio)
    // }

    // --

    let target_utilization_rate = from_bps(target_liq_utilization_rate_bps);
    let lp_fee = from_bps(lp_fee_bps);
    let solauto_fee = from_bps(solauto_fee_bps);
    if boosting {
        (target_utilization_rate * liq_threshold * supply_usd - debt_usd) /
            ((1.0).add(lp_fee) - target_utilization_rate * (1.0).sub(solauto_fee) * liq_threshold)
    } else {
        (target_utilization_rate * liq_threshold * supply_usd - debt_usd) /
            ((1.0).sub(solauto_fee) - target_utilization_rate * liq_threshold)
    }

    // --

    // let adjustment_fee = from_bps(solauto_fee_bps) + from_bps(lp_fee_bps); // TODO: this needs to be fixed

    // let target_liq_utilization_rate = from_bps(target_liq_utilization_rate_bps);

    // (target_liq_utilization_rate * supply_usd * liq_threshold - debt_usd) /
    //     (1.0 - target_liq_utilization_rate * (1.0 - adjustment_fee) * liq_threshold)
}

#[cfg(test)]
mod tests {
    use std::ops::Sub;

    use super::*;

    const INIT_ASSET_WEIGHT_1: f64 = 0.8;
    const MAINT_ASSET_WEIGHT_1: f64 = 0.9;
    const INIT_ASSET_WEIGHT_2: f64 = 0.5;
    const MAINT_ASSET_WEIGHT_2: f64 = 0.65;
    const INIT_LIAB_WEIGHT_1: f64 = 1.25;
    const MAINT_LIAB_WEIGHT_1: f64 = 1.1;

    struct AssetWeights {
        pub init_asset_weight: f64,
        pub init_debt_weight: f64,
        pub maint_asset_weight: f64,
        pub maint_debt_weight: f64,
    }

    impl AssetWeights {
        pub fn max_ltv(&self) -> f64 {
            self.init_asset_weight.div(self.init_debt_weight)
        }
        pub fn liq_threshold(&self) -> f64 {
            self.maint_asset_weight.div(self.maint_debt_weight)
        }
        pub fn max_boost_to_bps(&self) -> u16 {
            get_max_boost_to_bps(to_bps(self.max_ltv()), to_bps(self.liq_threshold()))
        }
    }

    fn round_to_places(value: f64, places: u32) -> f64 {
        let multiplier = (10_f64).powi(places as i32);
        (value * multiplier).round() / multiplier
    }

    fn test_debt_adjustment_calculation(
        weights: &AssetWeights,
        mut supply_usd: f64,
        mut debt_usd: f64,
        target_liq_utilization_rate: f64
    ) {
        let AssetWeights { maint_asset_weight, maint_debt_weight, .. } = weights;
        let liq_threshold = weights.liq_threshold();

        let is_boost =
            get_liq_utilization_rate_bps(supply_usd, debt_usd, liq_threshold) <
            to_bps(target_liq_utilization_rate);

        let solauto_fee_bps = 50;
        let lp_fee_bps = if is_boost {
            50
        } else {
            0
        };
        let debt_adjustment = get_debt_adjustment_usd(
            liq_threshold,
            supply_usd,
            debt_usd,
            to_bps(target_liq_utilization_rate),
            solauto_fee_bps,
            lp_fee_bps
        );

        let debt_adjustment_minus_fees = debt_adjustment.sub(
            debt_adjustment.mul(from_bps(solauto_fee_bps))
        );
        println!("{}, {}", debt_adjustment, debt_adjustment_minus_fees);
        supply_usd += if is_boost { debt_adjustment_minus_fees } else { debt_adjustment };
        debt_usd += if is_boost { debt_adjustment } else { debt_adjustment_minus_fees };

        if lp_fee_bps > 0 {
            debt_usd += debt_adjustment.mul(from_bps(lp_fee_bps));
        }

        let new_liq_utilization_rate_bps = get_liq_utilization_rate_bps(
            supply_usd,
            debt_usd,
            liq_threshold
        );

        let marginfi_liq_utilization_rate = (1.0).sub(
            supply_usd
                .mul(maint_asset_weight)
                .sub(debt_usd.mul(maint_debt_weight))
                .div(supply_usd.mul(maint_asset_weight))
        );

        println!(
            "{}, {}, {}",
            target_liq_utilization_rate,
            from_bps(new_liq_utilization_rate_bps),
            marginfi_liq_utilization_rate
        );

        assert_eq!(
            round_to_places(from_bps(new_liq_utilization_rate_bps), 2),
            round_to_places(target_liq_utilization_rate, 2)
        );

        assert_eq!(
            round_to_places(marginfi_liq_utilization_rate, 4),
            round_to_places(target_liq_utilization_rate, 4)
        );
    }

    fn test_debt_adjustment_for_weights(weights: &AssetWeights) {
        test_debt_adjustment_calculation(weights, 100.0, 80.0, 0.8);
        test_debt_adjustment_calculation(weights, 30.0, 5.0, 0.5);
        test_debt_adjustment_calculation(weights, 44334.0, 24534.0, 0.5);
        test_debt_adjustment_calculation(weights, 7644.0, 434.0, 0.8);
        test_debt_adjustment_calculation(weights, 10444.0, 7454.0, 0.2);
        test_debt_adjustment_calculation(weights, 1340444.0, 7454.0, 0.35);
        test_debt_adjustment_calculation(weights, 1000000.0, 519999.0, 0.65);
        test_debt_adjustment_calculation(
            weights,
            3453.0,
            1345.0,
            from_bps(weights.max_boost_to_bps())
        );
    }

    #[test]
    fn test_weights_1_debt_adjustment() {
        test_debt_adjustment_for_weights(
            &(AssetWeights {
                init_asset_weight: INIT_ASSET_WEIGHT_1,
                init_debt_weight: INIT_LIAB_WEIGHT_1,
                maint_asset_weight: MAINT_ASSET_WEIGHT_1,
                maint_debt_weight: MAINT_LIAB_WEIGHT_1,
            })
        );
    }

    #[test]
    fn test_weights_2_debt_adjustment() {
        test_debt_adjustment_for_weights(
            &(AssetWeights {
                init_asset_weight: INIT_ASSET_WEIGHT_2,
                init_debt_weight: INIT_LIAB_WEIGHT_1,
                maint_asset_weight: MAINT_ASSET_WEIGHT_2,
                maint_debt_weight: MAINT_LIAB_WEIGHT_1,
            })
        );
    }
}
