use borsh::{BorshDeserialize, BorshSerialize};
use shank::{ShankAccount, ShankType};
use solana_program::pubkey::Pubkey;
use std::ops::{Add, Div, Mul};

use crate::{
    constants::USD_DECIMALS,
    utils::math_utils::{from_base_unit, get_liq_utilization_rate_bps, to_base_unit},
};

use super::shared::{AutomationSettings, LendingPlatform};

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, Default)]
pub struct TokenAmount {
    pub base_unit: u64,
    /// Denominated by 9 decimal places
    base_amount_usd_value: u64,
}

impl TokenAmount {
    pub fn usd_value(&self) -> f64 {
        from_base_unit::<u64, u8, f64>(self.base_amount_usd_value, USD_DECIMALS)
    }
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, Default)]
pub struct PositionTokenUsage {
    pub mint: Pubkey,
    pub decimals: u8,
    pub amount_used: TokenAmount,
    pub amount_can_be_used: TokenAmount,
    /// Denominated by 9 decimal places
    base_amount_market_price_usd: u64,
    pub flash_loan_fee_bps: u16,
    pub borrow_fee_bps: Option<u16>,
}

impl PositionTokenUsage {
    pub fn market_price(&self) -> f64 {
        from_base_unit::<u64, u8, f64>(self.base_amount_market_price_usd, USD_DECIMALS)
    }
    fn update_usd_values(&mut self) {
        self.amount_used.base_amount_usd_value = to_base_unit::<f64, u8, u64>(
            from_base_unit::<u64, u8, f64>(self.amount_used.base_unit, self.decimals)
                .mul(self.market_price()),
            USD_DECIMALS,
        );
        self.amount_can_be_used.base_amount_usd_value = to_base_unit::<f64, u8, u64>(
            from_base_unit::<u64, u8, f64>(self.amount_used.base_unit, self.decimals)
                .mul(self.market_price()),
            USD_DECIMALS,
        );
    }
    pub fn update_usage(&mut self, base_unit_amount_update: i64) {
        if base_unit_amount_update.is_positive() {
            let addition = if self.borrow_fee_bps.is_some() {
                (base_unit_amount_update as f64)
                    .mul((self.borrow_fee_bps.unwrap() as f64).div(10000.0)) as u64
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
        self.base_amount_market_price_usd =
            to_base_unit::<f64, u8, u64>(market_price, USD_DECIMALS);
        self.update_usd_values();
    }
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Copy, Debug, ShankType, Default)]
pub struct DebtToAddToPosition {
    pub base_unit_debt_amount: u64,
    /// This value is used to determine whether or not to increase leverage,
    /// or simply swap and deposit supply, depending on the distance from `current_liq_utilization_rate` to `repay_from` parameter.
    /// e.g. a lower value will mean the DCA will more likely increase leverage than not, and vice-versa.
    /// Defaults to 1500.
    pub risk_aversion_bps: Option<u16>,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType)]
pub struct DCASettings {
    pub automation: AutomationSettings,
    // Gradually add more debt to the position during the DCA period. If this is not provided, then a DCA-out is assumed.
    pub add_to_pos: Option<DebtToAddToPosition>,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, Default)]
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
    pub target_boost_to_bps: Option<u16>,
    /// Data required if providing a target_boost_to_bps
    pub automation: Option<AutomationSettings>,
}

impl SolautoSettingsParameters {
    pub fn boost_from_bps(&self) -> u16 {
        self.boost_to_bps.saturating_sub(self.boost_gap)
    }
    pub fn repay_from_bps(&self) -> u16 {
        self.repay_to_bps.add(self.repay_gap)
    }
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, Default)]
pub struct LendingProtocolPositionData {
    /// Marginfi: "marginfi_account", Solend: "obligation", Kamino: "obligation"
    pub protocol_account: Pubkey,
    /// The supply token mint
    pub supply_mint: Pubkey,
    /// The debt token mint
    pub debt_mint: Pubkey,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, Default)]
pub struct PositionState {
    /// Should not be accessed directly, use liq_utilization_rate_bps() at SolautoPosition level
    liq_utilization_rate_bps: u16,
    /// Denominated by 9 decimal places
    pub net_worth_base_amount_usd: u64,
    pub net_worth_base_amount_supply_mint: u64,

    pub supply: PositionTokenUsage,
    pub debt: PositionTokenUsage,

    pub max_ltv_bps: u16,
    pub liq_threshold_bps: u16,
    pub last_updated: u64,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, Default)]
pub struct PositionData {
    pub lending_platform: LendingPlatform,
    pub protocol_data: LendingProtocolPositionData,
    pub setting_params: SolautoSettingsParameters,
    pub active_dca: Option<DCASettings>,
    pub debt_ta_balance: u64,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankAccount)]
pub struct SolautoPosition {
    _position_id_arr: [u8; 1],
    _bump: [u8; 1],
    pub position_id: u8,
    pub authority: Pubkey,
    pub self_managed: bool,
    pub position: Option<PositionData>,
    pub state: PositionState,
    _padding: [u8; 128],
}

impl SolautoPosition {
    pub const LEN: usize = 560;
    pub fn new(
        position_id: u8,
        authority: Pubkey,
        position: Option<PositionData>,
        state: PositionState,
    ) -> Self {
        let (_, bump) =
            Pubkey::find_program_address(&[&[position_id], authority.as_ref()], &crate::ID);
        Self {
            _position_id_arr: [position_id],
            _bump: [bump],
            position_id,
            authority,
            self_managed: position_id == 0,
            position,
            state,
            _padding: [0; 128],
        }
    }
    pub fn seeds<'a>(&'a self) -> Vec<&'a [u8]> {
        vec![&self._position_id_arr, self.authority.as_ref()]
    }
    pub fn seeds_with_bump<'a>(&'a self) -> Vec<&'a [u8]> {
        let mut seeds = self.seeds();
        seeds.push(&self._bump);
        seeds
    }
    pub fn liq_utilization_rate_bps(&self) -> u16 {
        get_liq_utilization_rate_bps(
            self.state.supply.amount_used.usd_value(),
            self.state.debt.amount_used.usd_value(),
            (self.state.liq_threshold_bps as f64).div(10000.0),
        )
    }
    pub fn refresh_liq_utilization_rate_bps(&mut self) {
        self.state.liq_utilization_rate_bps = self.liq_utilization_rate_bps();
    }
}

mod tests {
    use super::*;
    use solana_program::pubkey::Pubkey;

    #[test]
    fn validate_size() {
        let pubkey_example = Pubkey::new_unique();
        let token_amount = TokenAmount {
            base_unit: 1000000,
            base_amount_usd_value: 5000000,
        };
        let position_token_usage = PositionTokenUsage {
            mint: pubkey_example,
            decimals: 8,
            amount_used: token_amount.clone(),
            amount_can_be_used: token_amount.clone(),
            base_amount_market_price_usd: 15000000,
            flash_loan_fee_bps: 500,
            borrow_fee_bps: Some(250),
        };
        let position_state = PositionState {
            liq_utilization_rate_bps: 7500,
            net_worth_base_amount_usd: 20000000,
            net_worth_base_amount_supply_mint: 10000000,
            supply: position_token_usage.clone(),
            debt: position_token_usage,
            max_ltv_bps: 8000,
            liq_threshold_bps: 8500,
            last_updated: 1640995200,
        };
        let automation_settings = AutomationSettings {
            unix_start_date: 1640995200,
            interval_seconds: 86400,
            periods_passed: 10,
            target_periods: 100,
        };
        let debt_to_add = DebtToAddToPosition {
            base_unit_debt_amount: 5000,
            risk_aversion_bps: Some(1200),
        };
        let dca_settings = DCASettings {
            automation: automation_settings.clone(),
            add_to_pos: Some(debt_to_add),
        };
        let solauto_settings_parameters = SolautoSettingsParameters {
            boost_to_bps: 7000,
            boost_gap: 200,
            repay_to_bps: 3000,
            repay_gap: 100,
            target_boost_to_bps: Some(7200),
            automation: Some(automation_settings),
        };
        let lending_protocol_position_data = LendingProtocolPositionData {
            protocol_account: pubkey_example,
            supply_mint: pubkey_example,
            debt_mint: pubkey_example,
        };
        let position_data = PositionData {
            lending_platform: LendingPlatform::Marginfi,
            protocol_data: lending_protocol_position_data,
            setting_params: solauto_settings_parameters,
            active_dca: Some(dca_settings),
            debt_ta_balance: 15000,
        };
        let solauto_position = SolautoPosition {
            _position_id_arr: [0],
            _bump: [1],
            position_id: 42,
            authority: pubkey_example,
            self_managed: true,
            position: Some(position_data),
            state: position_state,
            _padding: [0; 128],
        };

        println!("{}", std::mem::size_of_val(&solauto_position));
        assert!(std::mem::size_of_val(&solauto_position) == SolautoPosition::LEN);
    }
}
