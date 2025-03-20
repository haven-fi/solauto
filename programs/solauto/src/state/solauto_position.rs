use borsh::{BorshDeserialize, BorshSerialize};
use bytemuck::{Pod, Zeroable};
use shank::{ShankAccount, ShankType};
use solana_program::{msg, pubkey::Pubkey};
use std::ops::{Add, Mul};

use crate::{
    constants::USD_DECIMALS,
    types::shared::{
        LendingPlatform, PodBool, PositionType, RebalanceDirection, SolautoRebalanceType, TokenType,
    },
    utils::math_utils::{
        base_unit_to_usd_value, from_bps, from_rounded_usd_value, get_liq_utilization_rate_bps,
        net_worth_base_amount, to_base_unit, to_rounded_usd_value,
    },
};

use super::automation::DCASettings;

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
        from_rounded_usd_value(self.base_amount_usd_value)
    }
    pub fn update_usd_value(&mut self, market_price: f64, token_decimals: u8) {
        self.base_amount_usd_value = to_rounded_usd_value(base_unit_to_usd_value(
            self.base_unit,
            token_decimals,
            market_price,
        ));
    }
}

#[repr(C, align(8))]
#[derive(ShankType, BorshSerialize, Clone, Debug, Default, Copy, Pod, Zeroable)]
pub struct PositionTokenState {
    pub mint: Pubkey,
    pub decimals: u8,
    _padding1: [u8; 3],
    pub flash_loan_fee_bps: u16,
    pub borrow_fee_bps: u16,
    pub amount_used: TokenAmount,
    pub amount_can_be_used: TokenAmount,
    /// Denominated by 9 decimal places
    base_amount_market_price_usd: u64,
    _padding2: [u8; 8],
    _padding: [u8; 32],
}

impl PositionTokenState {
    #[inline(always)]
    pub fn market_price(&self) -> f64 {
        from_rounded_usd_value(self.base_amount_market_price_usd)
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
pub struct SolautoSettingsParametersInp {
    pub boost_to_bps: u16,
    pub boost_gap: u16,
    pub repay_to_bps: u16,
    pub repay_gap: u16,
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
    _padding: [u32; 24],
}

impl SolautoSettingsParameters {
    pub fn from(args: SolautoSettingsParametersInp) -> Self {
        Self {
            boost_to_bps: args.boost_to_bps,
            boost_gap: args.boost_gap,
            repay_to_bps: args.repay_to_bps,
            repay_gap: args.repay_gap,
            _padding: [0; 24],
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

    pub supply: PositionTokenState,
    pub debt: PositionTokenState,

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
    pub protocol_user_account: Pubkey,
    pub protocol_supply_account: Pubkey,
    pub protocol_debt_account: Pubkey,
    pub setting_params: SolautoSettingsParameters,
    pub dca: DCASettings,
    _padding: [u32; 4],
}

#[repr(u8)]
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, Default, PartialEq, Copy)]
pub enum TokenBalanceChangeType {
    #[default]
    None,
    PreSwapDeposit,
    PostSwapDeposit,
    PostRebalanceWithdrawSupplyToken,
    PostRebalanceWithdrawDebtToken,
}
unsafe impl Zeroable for TokenBalanceChangeType {}
unsafe impl Pod for TokenBalanceChangeType {}

#[repr(C, align(8))]
#[derive(ShankType, BorshSerialize, Clone, Debug, Default, Copy, Pod, Zeroable)]
pub struct TokenBalanceChange {
    pub change_type: TokenBalanceChangeType,
    _padding1: [u8; 7],
    // Denominated in 9 decimal places
    pub amount_usd: u64,
}

impl TokenBalanceChange {
    pub fn requires_one(&self) -> bool {
        self.change_type != TokenBalanceChangeType::None
    }
}

#[repr(C, align(8))]
#[derive(ShankType, BorshSerialize, Clone, Debug, Default, Copy, Pod, Zeroable)]
pub struct RebalanceStateValues {
    pub rebalance_direction: RebalanceDirection,
    _padding1: [u8; 7],
    // Denominated in 9 decimal places
    pub target_supply_usd: u64,
    // Denominated in 9 decimal places
    pub target_debt_usd: u64,
    pub token_balance_change: TokenBalanceChange,
    _padding: [u32; 4],
}

impl RebalanceStateValues {
    pub fn from(
        rebalance_direction: RebalanceDirection,
        target_supply_usd: f64,
        target_debt_usd: f64,
        token_balance_change: Option<TokenBalanceChange>,
    ) -> Self {
        let tb_change = if token_balance_change.is_some() {
            token_balance_change.unwrap()
        } else {
            TokenBalanceChange::default()
        };
        Self {
            rebalance_direction,
            _padding1: [0; 7],
            target_supply_usd: to_rounded_usd_value(target_supply_usd),
            target_debt_usd: to_rounded_usd_value(target_debt_usd),
            token_balance_change: tb_change,
            _padding: [0; 4],
        }
    }
}

#[repr(C, align(8))]
#[derive(ShankType, BorshSerialize, Clone, Debug, Default, Copy, Pod, Zeroable)]
pub struct RebalanceInstructionData {
    pub active: PodBool,
    pub rebalance_type: SolautoRebalanceType,
    _padding1: [u8; 6],
    pub flash_loan_amount: u64,
    _padding: [u32; 4],
}

#[repr(C, align(8))]
#[derive(ShankType, BorshSerialize, Clone, Debug, Default, Copy, Pod, Zeroable)]
pub struct RebalanceData {
    pub ixs: RebalanceInstructionData,
    pub values: RebalanceStateValues,
}

impl RebalanceData {
    #[inline(always)]
    pub fn active(&self) -> bool {
        self.ixs.active.val
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
    _padding: [u32; 24],
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
            _padding: [0; 24],
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
}
