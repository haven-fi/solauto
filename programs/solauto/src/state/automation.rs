use borsh::{BorshDeserialize, BorshSerialize};
use bytemuck::{Pod, Zeroable};
use num_traits::{FromPrimitive, ToPrimitive};
use shank::ShankType;
use std::{
    cmp::min,
    ops::{Add, Div, Mul, Sub},
};

use crate::types::shared::TokenType;

#[derive(BorshDeserialize, Clone, Debug, Copy, Default)]
pub struct AutomationSettingsInp {
    pub target_periods: u16,
    pub periods_passed: u16,
    pub unix_start_date: u64,
    pub interval_seconds: u64,
}

#[repr(C, align(8))]
#[derive(
    ShankType, BorshSerialize, BorshDeserialize, Clone, Debug, Default, Copy, Pod, Zeroable,
)]
pub struct AutomationSettings {
    /// The target number of periods
    pub target_periods: u16,
    /// How many periods have already passed
    pub periods_passed: u16,
    _padding1: [u8; 4],
    /// The unix timestamp (in seconds) start date of DCA
    pub unix_start_date: u64,
    /// The interval in seconds between each DCA
    pub interval_seconds: u64,
    _padding: [u8; 32],
}

impl AutomationSettings {
    pub fn from(args: AutomationSettingsInp) -> Self {
        Self {
            target_periods: args.target_periods,
            periods_passed: args.periods_passed,
            unix_start_date: args.unix_start_date,
            interval_seconds: args.interval_seconds,
            _padding1: [0; 4],
            _padding: [0; 32],
        }
    }
    #[inline(always)]
    pub fn is_active(&self) -> bool {
        self.target_periods > 0
    }
    #[inline(always)]
    pub fn eligible_for_next_period(&self, curr_unix_timestamp: u64) -> bool {
        if self.periods_passed == 0 {
            curr_unix_timestamp >= self.unix_start_date
        } else {
            curr_unix_timestamp
                >= self
                    .unix_start_date
                    .add(self.interval_seconds.mul(self.periods_passed as u64))
        }
    }
    pub fn updated_amount_from_automation<T: ToPrimitive + FromPrimitive>(
        &self,
        curr_amt: T,
        target_amt: T,
        curr_unix_timestamp: u64,
    ) -> T {
        let curr_amt_f64 = curr_amt.to_f64().unwrap();
        let target_amt_f64 = target_amt.to_f64().unwrap();
        let current_rate_diff = curr_amt_f64 - target_amt_f64;
        let progress_pct = (1.0).div(
            self.target_periods
                .sub(self.new_periods_passed(curr_unix_timestamp) - 1) as f64,
        );
        let new_amt = curr_amt_f64 - current_rate_diff * progress_pct;

        T::from_f64(new_amt).unwrap()
    }
    #[inline(always)]
    pub fn new_periods_passed(&self, curr_unix_timestamp: u64) -> u16 {
        min(
            self.target_periods,
            (((curr_unix_timestamp.saturating_sub(self.unix_start_date) as f64)
                / (self.interval_seconds as f64))
                .floor() as u16)
                + 1,
        )
    }
}

#[derive(BorshDeserialize, Clone, Debug, Copy, Default)]
pub struct DCASettingsInp {
    pub automation: AutomationSettingsInp,
    pub dca_in_base_unit: u64,
    pub token_type: TokenType,
}

#[repr(C, align(8))]
#[derive(
    ShankType, BorshSerialize, BorshDeserialize, Clone, Debug, Default, Copy, Pod, Zeroable,
)]
pub struct DCASettings {
    pub automation: AutomationSettings,
    // Gradually add more to the position during the DCA period. If this is 0, then a DCA-out is assumed.
    pub dca_in_base_unit: u64,
    pub token_type: TokenType,
    _padding: [u8; 31],
}

impl DCASettings {
    pub fn from(args: DCASettingsInp) -> Self {
        Self {
            automation: AutomationSettings::from(args.automation),
            dca_in_base_unit: args.dca_in_base_unit,
            token_type: args.token_type,
            _padding: [0; 31],
        }
    }
    #[inline(always)]
    pub fn dca_in(&self) -> bool {
        self.dca_in_base_unit > 0
    }
    #[inline(always)]
    pub fn is_active(&self) -> bool {
        self.automation.is_active()
    }
}

mod tests {
    use super::*;

    #[test]
    fn validate_period_eligibility() {
        let automation = AutomationSettings::from(AutomationSettingsInp {
            target_periods: 4,
            periods_passed: 3,
            unix_start_date: 0,
            interval_seconds: 5,
        });

        assert!(automation.eligible_for_next_period(2 * 5 + 4) == false);
        assert!(automation.eligible_for_next_period(3 * 5) == true);
    }

    #[test]
    fn validate_new_periods_passed() {
        let automation = AutomationSettings::from(AutomationSettingsInp {
            target_periods: 4,
            periods_passed: 0,
            unix_start_date: 0,
            interval_seconds: 5,
        });

        assert!(automation.new_periods_passed(0) == 1);
        assert!(automation.new_periods_passed(4 * 5) == 4);
        assert!(automation.new_periods_passed(5 * 5) == 4);
    }

    #[test]
    fn validate_updated_automation_value() {
        let mut automation = AutomationSettings::from(AutomationSettingsInp {
            target_periods: 4,
            periods_passed: 0,
            unix_start_date: 0,
            interval_seconds: 5,
        });

        assert!(automation.updated_amount_from_automation(10.0, 0.0, 0) == 7.5);

        automation.periods_passed = 1;
        assert!(automation.updated_amount_from_automation(7.5, 0.0, 5) == 5.0);

        automation.periods_passed = 2;
        assert!(automation.updated_amount_from_automation(5.0, 0.0, 10) == 2.5);

        automation.periods_passed = 3;
        assert!(automation.updated_amount_from_automation(2.5, 0.0, 15) == 0.0);
    }
}
