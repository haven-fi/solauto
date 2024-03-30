use borsh::{ BorshDeserialize, BorshSerialize };
use shank::{ ShankContext, ShankInstruction };

use super::shared::*;

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankContext, ShankInstruction)]
#[rustfmt::skip]
pub enum Instruction {
    /// Opens a Solauto position
    #[account(signer, writable, name = "signer", desc = "TODO")]
    #[account(name = "solend_program", desc = "TODO")]
    #[account(name = "system_program", desc = "TODO")]
    #[account(name = "token_program", desc = "TODO")]
    #[account(name = "ata_program", desc = "TODO")]
    #[account(name = "rent", desc = "TODO")]
    #[account(name = "lending_market", desc = "TODO")]
    #[account(mut, name = "obligation", desc = "TODO")]
    #[account(mut, optional, name = "solauto_position", desc = "TODO")]
    #[account(mut, name = "supply_collateral_token_account", desc = "TODO")]
    #[account(name = "supply_collateral_token_mint", desc = "TODO")]
    #[account(mut, name = "debt_liquidity_token_account", desc = "TODO")]
    #[account(name = "debt_liquidity_token_mint", desc = "TODO")]
    SolendOpenPosition(OpenPositionArgs),

    // UpdatePosition, TODO

    #[account(signer, name = "signer")]
    #[account(name = "solend_program", desc = "TODO")]
    #[account(name = "clock", desc = "TODO")]
    #[account(mut, name = "supply_reserve", desc = "TODO")]
    #[account(name = "supply_reserve_pyth_price_oracle", desc = "TODO")]
    #[account(name = "supply_reserve_switchboard_oracle", desc = "TODO")]
    #[account(mut, optional, name = "debt_reserve", desc = "TODO")]
    #[account(optional, name = "debt_reserve_pyth_price_oracle", desc = "TODO")]
    #[account(optional, name = "debt_reserve_switchboard_oracle", desc = "TODO")]
    #[account(name = "lending_market", desc = "TODO")]
    #[account(mut, optional, name = "obligation", desc = "TODO")]
    #[account(mut, optional, name = "solauto_position", desc = "TODO")]
    SolendRefreshData,

    #[account(signer, writable, name = "signer", desc = "TODO")]
    #[account(name = "solend_program", desc = "TODO")]
    #[account(name = "system_program", desc = "TODO")]
    #[account(name = "token_program", desc = "TODO")]
    #[account(name = "ata_program", desc = "TODO")]
    #[account(name = "clock", desc = "TODO")]
    #[account(name = "rent", desc = "TODO")]
    #[account(name = "lending_market", desc = "TODO")]
    #[account(name = "obligation", desc = "TODO")]
    #[account(mut, optional, name = "solauto_position", desc = "TODO")]
    #[account(name = "solauto_fee_receiver", desc = "TODO")]
    #[account(optional, name = "supply_reserve", desc = "TODO")]
    #[account(optional, name = "supply_reserve_pyth_price_oracle", desc = "TODO")]
    #[account(optional, name = "supply_reserve_switchboard_oracle", desc = "TODO")]
    #[account(optional, name = "supply_liquidity_token_mint", desc = "TODO")]
    #[account(optional, name = "source_supply_liquidity", desc = "TODO")]
    #[account(optional, name = "reserve_supply_liquidity", desc = "TODO")]
    #[account(optional, name = "supply_collateral_token_mint", desc = "TODO")]
    #[account(optional, name = "source_supply_collateral", desc = "TODO")]
    #[account(optional, name = "reserve_supply_collateral", desc = "TODO")]
    #[account(optional, name = "debt_reserve", desc = "TODO")]
    #[account(optional, name = "debt_reserve_fee_receiver", desc = "TODO")]
    #[account(optional, name = "debt_liquidity_token_mint", desc = "TODO")]
    #[account(optional, name = "source_debt_liquidity", desc = "TODO")]
    #[account(optional, name = "reserve_debt_liquidity", desc = "TODO")]
    SolendProtocolInteraction(ProtocolInteractionArgs),

    // RebalancePing TODO
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct NewPositionData {
    /// ID of the Solauto position
    pub position_id: u8,
    /// Setting parameters for the position
    pub setting_params: SolautoSettingsParameters,
    /// Solend-specific data for the position
    pub solend_data: Option<SolendPositionData>,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct OpenPositionArgs {
    /// Position data if this is a solauto-managed position
    pub position_data: Option<NewPositionData>
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct ProtocolInteractionArgs {
    /// Action to take with the protocol
    pub action: ProtocolAction,
    /// Amount of liquidity to use when taking the action
    pub action_amount: u64,
    /// Whether to rebalance to a specific utilization after taking the action
    pub rebalance_utilization_rate_bps: Option<u16>,
}
