use std::ops::Mul;

use crate::{constants::REFERRER_PERCENTAGE, types::shared::RebalanceDirection};

pub struct FeePayout {
    pub solauto: u16,
    pub referrer: u16,
    pub total: u16,
}

#[derive(Clone, Copy)]
pub struct SolautoFeesBps {
    has_been_referred: bool,
    target_liq_utilization_rate_bps: Option<u16>,
    position_net_worth_usd: f64,
    mock_fee_bps: Option<u16>,
}
impl SolautoFeesBps {
    pub fn from_mock(total_fees_bps: u16, has_been_referred: bool) -> Self {
        Self {
            mock_fee_bps: Some(total_fees_bps),
            has_been_referred: has_been_referred,
            target_liq_utilization_rate_bps: None,
            position_net_worth_usd: 0.0,
        }
    }
    pub fn from(
        has_been_referred: bool,
        target_liq_utilization_rate_bps: Option<u16>,
        position_net_worth_usd: f64,
    ) -> Self {
        Self {
            has_been_referred,
            target_liq_utilization_rate_bps,
            position_net_worth_usd,
            mock_fee_bps: None,
        }
    }
    pub fn fetch_fees(&self, rebalance_direction: &RebalanceDirection) -> FeePayout {
        if self.mock_fee_bps.is_some() {
            let fee_bps = self.mock_fee_bps.unwrap();
            let (solauto_fee, referrer_fee) = if self.has_been_referred {
                (
                    (fee_bps as f64).mul(0.85).floor() as u16,
                    (fee_bps as f64).mul(0.15).floor() as u16,
                )
            } else {
                (fee_bps, 0)
            };
            return FeePayout {
                total: fee_bps,
                solauto: solauto_fee,
                referrer: referrer_fee,
            };
        }

        let min_size: f64 = 10000.0; // Minimum position size
        let max_size: f64 = 250000.0; // Maximum position size
        let max_fee_bps: f64 = 50.0; // Fee in basis points for min_size (0.5%)
        let min_fee_bps: f64 = 25.0; // Fee in basis points for max_size (0.25%)
        let k = 1.5;

        let mut fee_bps: f64;
        if self.target_liq_utilization_rate_bps.is_some() {
            fee_bps = 10.0;
        } else if rebalance_direction == &RebalanceDirection::Repay {
            fee_bps = 25.0;
        } else if self.position_net_worth_usd <= min_size {
            fee_bps = max_fee_bps;
        } else if self.position_net_worth_usd >= max_size {
            fee_bps = min_fee_bps;
        } else {
            let t = (self.position_net_worth_usd.ln() - min_size.ln())
                / (max_size.ln() - min_size.ln());
            fee_bps = (min_fee_bps + (max_fee_bps - min_fee_bps) * (1.0 - t.powf(k))).round();
        }

        let mut referrer_fee = 0.0;
        if self.has_been_referred {
            fee_bps = fee_bps * (1.0 - REFERRER_PERCENTAGE);
            referrer_fee = fee_bps.mul(REFERRER_PERCENTAGE).floor();
        }

        FeePayout {
            solauto: (fee_bps - referrer_fee) as u16,
            referrer: referrer_fee as u16,
            total: fee_bps as u16,
        }
    }
}
