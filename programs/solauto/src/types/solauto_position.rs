use borsh::{ BorshDeserialize, BorshSerialize };
use shank::{ ShankAccount, ShankType };
use solana_program::pubkey::Pubkey;
use std::ops::Add;

use super::shared::{AutomationSettings, LendingPlatform};

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
    pub liq_utilization_rate_bps: u16,
    // Denominated by 6 decimal places
    pub net_worth_base_amount_usd: u64,
    pub net_worth_base_amount_supply_mint: u64,
    pub base_amount_supplied: u64,
    pub base_amount_borrowed: u64,
    pub max_ltv_bps: Option<u16>,
    pub liq_threshold_bps: u16,
    pub last_updated: u64,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, Default)]
pub struct PositionData {
    pub state: PositionState,
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
    _padding: [u8; 128],
}

impl SolautoPosition {
    pub const LEN: usize = 397;
    pub fn new(position_id: u8, authority: Pubkey, position: Option<PositionData>) -> Self {
        let (_, bump) = Pubkey::find_program_address(
            &[&[position_id], authority.as_ref()],
            &crate::ID
        );
        Self {
            _position_id_arr: [position_id],
            _bump: [bump],
            position_id,
            authority,
            self_managed: position_id == 0,
            position,
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
}
