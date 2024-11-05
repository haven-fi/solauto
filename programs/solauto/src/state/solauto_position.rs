use borsh::{BorshDeserialize, BorshSerialize};
use bytemuck::{Pod, Zeroable};
use num_traits::{FromPrimitive, ToPrimitive};
use shank::{ShankAccount, ShankType};
use solana_program::{msg, pubkey::Pubkey};
use std::{
    cmp::min,
    ops::{Add, Div, Mul, Sub},
};

use crate::{
    constants::USD_DECIMALS,
    types::shared::{PodBool, PositionType, RebalanceDirection, TokenType},
    utils::math_utils::{
        from_base_unit, from_bps, get_liq_utilization_rate_bps, net_worth_base_amount, to_base_unit,
    },
};

use crate::types::shared::LendingPlatform;

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

#[repr(C, align(8))]
#[derive(ShankType, BorshSerialize, Clone, Debug, Default, Copy, Pod, Zeroable)]
pub struct TokenAmount {
    pub base_unit: u64,
    /// Denominated by 9 decimal places
    base_amount_usd_value: u64,
}

impl TokenAmount {
    #[inline(always)]
    pub fn usd_value(&self) -> f64 {
        from_base_unit::<u64, u8, f64>(self.base_amount_usd_value, USD_DECIMALS)
    }
    pub fn update_usd_value(&mut self, market_price: f64, token_decimals: u8) {
        self.base_amount_usd_value = to_base_unit::<f64, u8, u64>(
            from_base_unit::<u64, u8, f64>(self.base_unit, token_decimals).mul(market_price),
            USD_DECIMALS,
        );
    }
}

#[repr(C, align(8))]
#[derive(ShankType, BorshSerialize, Clone, Debug, Default, Copy, Pod, Zeroable)]
pub struct PositionTokenUsage {
    pub mint: Pubkey,
    pub decimals: u8,
    _padding1: [u8; 7],
    pub amount_used: TokenAmount,
    pub amount_can_be_used: TokenAmount,
    /// Denominated by 9 decimal places
    base_amount_market_price_usd: u64,
    // TODO: Flash loan fees are currently not considered in debt adjustment calculations
    pub flash_loan_fee_bps: u16,
    pub borrow_fee_bps: u16,
    _padding2: [u8; 4],
    _padding: [u8; 32],
}

impl PositionTokenUsage {
    #[inline(always)]
    pub fn market_price(&self) -> f64 {
        from_base_unit::<u64, u8, f64>(self.base_amount_market_price_usd, USD_DECIMALS)
    }
    fn update_usd_values(&mut self) {
        self.amount_used
            .update_usd_value(self.market_price(), self.decimals);
        self.amount_can_be_used
            .update_usd_value(self.market_price(), self.decimals);
    }
    pub fn update_usage(&mut self, base_unit_amount_update: i64) {
        if base_unit_amount_update.is_positive() {
            let addition = if self.borrow_fee_bps > 0 {
                (base_unit_amount_update as f64).mul(from_bps(self.borrow_fee_bps)) as u64
            } else {
                0
            };

            self.amount_used.base_unit += (base_unit_amount_update as u64) + addition;

            self.amount_can_be_used.base_unit = self
                .amount_can_be_used
                .base_unit
                .saturating_sub(base_unit_amount_update as u64);
        } else {
            self.amount_used.base_unit = self
                .amount_used
                .base_unit
                .saturating_sub((base_unit_amount_update * -1) as u64);
        }
        self.update_usd_values();
    }
    pub fn update_market_price(&mut self, market_price: f64) {
        msg!("New {} price: {}", self.mint, market_price);
        self.base_amount_market_price_usd =
            to_base_unit::<f64, u8, u64>(market_price, USD_DECIMALS);
        self.update_usd_values();
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

#[derive(BorshDeserialize, Clone, Debug, Copy, Default)]
pub struct SolautoSettingsParametersInp {
    pub boost_to_bps: u16,
    pub boost_gap: u16,
    pub repay_to_bps: u16,
    pub repay_gap: u16,
    pub target_boost_to_bps: Option<u16>,
    pub automation: Option<AutomationSettingsInp>,
}

#[repr(C, align(8))]
#[derive(
    ShankType, BorshSerialize, BorshDeserialize, Clone, Debug, Default, Copy, Pod, Zeroable,
)]
pub struct SolautoSettingsParameters {
    /// At which liquidation utilization rate to boost leverage to
    pub boost_to_bps: u16,
    /// boost_gap basis points below boost_to_bps is the liquidation utilization rate at which to begin a rebalance
    pub boost_gap: u16,
    /// At which liquidation utilization rate to finish a rebalance
    pub repay_to_bps: u16,
    /// repay_gap basis points above repay_to_bps is the liquidation utilization rate at which to begin a rebalance
    pub repay_gap: u16,
    /// If slowly adjusting the boost_to_bps with automation, this must be set
    pub target_boost_to_bps: u16,
    _padding1: [u8; 6],
    /// Data required if providing a target_boost_to_bps
    pub automation: AutomationSettings,
    _padding: [u8; 32],
}

impl SolautoSettingsParameters {
    pub fn from(args: SolautoSettingsParametersInp) -> Self {
        let target_boost_to_bps = if args.target_boost_to_bps.is_some() {
            args.target_boost_to_bps.unwrap()
        } else {
            0
        };
        let automation = if args.automation.is_some() {
            AutomationSettings::from(args.automation.unwrap())
        } else {
            AutomationSettings::default()
        };
        Self {
            boost_to_bps: args.boost_to_bps,
            boost_gap: args.boost_gap,
            repay_to_bps: args.repay_to_bps,
            repay_gap: args.repay_gap,
            target_boost_to_bps,
            automation,
            _padding1: [0; 6],
            _padding: [0; 32],
        }
    }
    #[inline(always)]
    pub fn boost_from_bps(&self) -> u16 {
        self.boost_to_bps.saturating_sub(self.boost_gap)
    }
    #[inline(always)]
    pub fn repay_from_bps(&self) -> u16 {
        self.repay_to_bps.add(self.repay_gap)
    }
}

#[repr(C, align(8))]
#[derive(ShankType, BorshSerialize, Clone, Debug, Default, Copy, Pod, Zeroable)]
pub struct PositionState {
    pub liq_utilization_rate_bps: u16,
    _padding1: [u8; 6],
    /// Denominated by 9 decimal places
    pub net_worth: TokenAmount,

    pub supply: PositionTokenUsage,
    pub debt: PositionTokenUsage,

    pub max_ltv_bps: u16,
    pub liq_threshold_bps: u16,
    _padding2: [u8; 4],
    pub last_updated: u64,
    _padding: [u32; 2],
}

#[repr(C, align(8))]
#[derive(ShankType, BorshSerialize, Clone, Debug, Default, Copy, Pod, Zeroable)]
pub struct PositionData {
    pub lending_platform: LendingPlatform,
    _padding1: [u8; 7],
    pub protocol_account: Pubkey,
    pub supply_mint: Pubkey,
    pub debt_mint: Pubkey,
    pub setting_params: SolautoSettingsParameters,
    pub dca: DCASettings,
    _padding: [u32; 4],
}

#[repr(u8)]
#[derive(ShankType, BorshDeserialize, BorshSerialize, Clone, Debug, Default, PartialEq, Copy)]
pub enum SolautoRebalanceType {
    #[default]
    None,
    Regular,
    DoubleRebalanceWithFL,
    SingleRebalanceWithFL,
}

unsafe impl Zeroable for SolautoRebalanceType {}
unsafe impl Pod for SolautoRebalanceType {}

#[repr(C, align(8))]
#[derive(ShankType, BorshSerialize, Clone, Debug, Default, Copy, Pod, Zeroable)]
pub struct RebalanceData {
    pub rebalance_type: SolautoRebalanceType,
    _padding1: [u8; 7],
    pub rebalance_direction: RebalanceDirection,
    _padding2: [u8; 7],
    pub flash_loan_amount: u64,
    _padding: [u8; 32],
}

impl RebalanceData {
    #[inline(always)]
    pub fn active(&self) -> bool {
        self.rebalance_type != SolautoRebalanceType::None
    }
}

#[repr(C, align(8))]
#[derive(ShankAccount, BorshSerialize, Clone, Debug, Copy, Pod, Zeroable)]
pub struct SolautoPosition {
    bump: [u8; 1],
    position_id: [u8; 1],
    pub self_managed: PodBool,
    pub position_type: PositionType,
    _padding1: [u8; 4],
    pub authority: Pubkey,
    pub position: PositionData,
    pub state: PositionState,
    pub rebalance: RebalanceData,
    _padding: [u32; 32],
}

impl SolautoPosition {
    pub const LEN: usize = 832;
    pub fn new(
        position_id: u8,
        authority: Pubkey,
        position_type: PositionType,
        position: PositionData,
        state: PositionState,
    ) -> Self {
        let (_, bump) =
            Pubkey::find_program_address(&[&[position_id], authority.as_ref()], &crate::ID);
        Self {
            bump: [bump],
            position_id: [position_id],
            self_managed: PodBool::new(position_id == 0),
            position_type: position_type,
            _padding1: [0; 4],
            authority,
            position,
            state,
            rebalance: RebalanceData::default(),
            _padding: [0; 32],
        }
    }
    #[inline(always)]
    pub fn position_id(&self) -> u8 {
        self.position_id[0]
    }
    #[inline(always)]
    pub fn seeds<'a>(&'a self) -> Vec<&'a [u8]> {
        vec![&self.position_id, self.authority.as_ref()]
    }
    #[inline(always)]
    pub fn seeds_with_bump<'a>(&'a self) -> Vec<&'a [u8]> {
        let mut seeds = self.seeds();
        seeds.push(&self.bump);
        seeds
    }
    pub fn refresh_state(&mut self) {
        let supply_usd = self.state.supply.amount_used.usd_value();
        let debt_usd = self.state.debt.amount_used.usd_value();

        self.state.liq_utilization_rate_bps = get_liq_utilization_rate_bps(
            supply_usd,
            debt_usd,
            from_bps(self.state.liq_threshold_bps),
        );

        self.state.net_worth.base_unit = net_worth_base_amount(
            supply_usd,
            debt_usd,
            self.state.supply.market_price(),
            self.state.supply.decimals,
        );
        self.state
            .net_worth
            .update_usd_value(self.state.supply.market_price(), self.state.supply.decimals);
        msg!(
            "New liquidation utilization rate: {}, (${}, ${})",
            self.state.liq_utilization_rate_bps,
            supply_usd,
            debt_usd
        );
    }
    pub fn update_usage(&mut self, token_type: TokenType, base_unit_amount_update: i64) {
        if token_type == TokenType::Supply {
            self.state.supply.update_usage(base_unit_amount_update);
        } else {
            self.state.debt.update_usage(base_unit_amount_update);
        }

        let supply_usd = self.state.supply.amount_used.usd_value();
        let debt_usd = self.state.debt.amount_used.usd_value();

        if supply_usd > debt_usd {
            self.refresh_state();
        } else {
            msg!("Supply USD < debt USD");
        }
    }
}

mod tests {
    use super::*;

    #[test]
    fn validate_size() {
        let solauto_position = SolautoPosition::new(
            1,
            Pubkey::default(),
            PositionType::default(),
            PositionData::default(),
            PositionState::default(),
        );
        println!(
            "Solauto position size: {}",
            std::mem::size_of_val(&solauto_position)
        );
        assert!(std::mem::size_of_val(&solauto_position) == SolautoPosition::LEN);
    }

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
