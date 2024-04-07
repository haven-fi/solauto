use borsh::{ BorshDeserialize, BorshSerialize };
use shank::{ ShankContext, ShankInstruction };

use super::shared::*;

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankContext, ShankInstruction)]
#[rustfmt::skip]
pub enum Instruction {
    #[account(signer, writable, name = "signer")]
    #[account(name = "solend_program")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(name = "ata_program")]
    #[account(name = "rent")]
    #[account(mut, optional, name = "solauto_position")]
    #[account(name = "lending_market")]
    #[account(mut, name = "obligation")]
    #[account(mut, name = "supply_collateral_token_account")]
    #[account(name = "supply_collateral_token_mint")]
    #[account(mut, name = "debt_liquidity_token_account")]
    #[account(name = "debt_liquidity_token_mint")]
    SolendOpenPosition(OpenPositionArgs),

    #[account(signer, writable, name = "signer")]
    #[account(name = "marginfi_program")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(name = "ata_program")]
    #[account(name = "rent")]
    #[account(name = "marginfi_group")]
    #[account(mut, name = "marginfi_account")]
    #[account(mut, optional, name = "solauto_position")]
    #[account(mut, name = "supply_token_account")]
    #[account(name = "supply_token_mint")]
    #[account(mut, name = "debt_token_account")]
    #[account(name = "debt_token_mint")]
    MarginfiOpenPosition(OpenPositionArgs),

    // UpdatePosition, TODO

    #[account(signer, name = "signer")]
    #[account(name = "solend_program")]
    #[account(name = "clock")]
    #[account(mut, name = "supply_reserve")]
    #[account(name = "supply_reserve_pyth_price_oracle")]
    #[account(name = "supply_reserve_switchboard_oracle")]
    #[account(mut, optional, name = "debt_reserve")]
    #[account(optional, name = "debt_reserve_pyth_price_oracle")]
    #[account(optional, name = "debt_reserve_switchboard_oracle")]
    #[account(name = "lending_market")]
    #[account(mut, optional, name = "obligation")]
    #[account(mut, optional, name = "solauto_position")]
    SolendRefreshData,

    #[account(signer, writable, name = "signer")]
    #[account(name = "solend_program")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(name = "ata_program")]
    #[account(name = "clock")]
    #[account(name = "rent")]
    #[account(mut, optional, name = "positions_manager")]
    #[account(mut, optional, name = "solauto_position")]
    #[account(mut, name = "solauto_fee_receiver")]
    #[account(name = "lending_market")]
    #[account(mut, name = "obligation")]
    #[account(mut, optional, name = "supply_reserve")]
    #[account(optional, name = "supply_reserve_pyth_price_oracle")]
    #[account(optional, name = "supply_reserve_switchboard_oracle")]
    #[account(optional, name = "supply_liquidity_token_mint")]
    #[account(mut, optional, name = "source_supply_liquidity")]
    #[account(mut, optional, name = "reserve_supply_liquidity")]
    #[account(optional, name = "supply_collateral_token_mint")]
    #[account(mut, optional, name = "source_supply_collateral")]
    #[account(mut, optional, name = "reserve_supply_collateral")]
    #[account(mut, optional, name = "debt_reserve")]
    #[account(mut, optional, name = "debt_reserve_fee_receiver")]
    #[account(optional, name = "debt_liquidity_token_mint")]
    #[account(mut, optional, name = "source_debt_liquidity")]
    #[account(mut, optional, name = "reserve_debt_liquidity")]
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
}
