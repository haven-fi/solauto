use borsh::{ BorshDeserialize, BorshSerialize };
use shank::{ ShankContext, ShankInstruction };

use super::shared::*;

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankContext, ShankInstruction)]
#[rustfmt::skip]
pub enum Instruction {
    /// Update Solauto admin settings (i.e. fees token mint)
    #[account(signer, mut, name = "solauto_admin")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(name = "rent")]
    #[account(mut, name = "solauto_admin_settings")]
    #[account(name = "fees_wallet")]
    #[account(mut, name = "fees_token_account")]
    #[account(name = "fees_token_mint")]
    UpdateSolautoAdminSettings,

    /// Open a new Solauto position with Marginfi
    #[account(signer, mut, name = "signer")]
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
    MarginfiOpenPosition(Option<PositionData>),

    /// Open a new Solauto position with Solend
    #[account(signer, mut, name = "signer")]
    #[account(name = "solend_program")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(name = "ata_program")]
    #[account(name = "rent")]
    #[account(mut, optional, name = "solauto_position")]
    #[account(name = "lending_market")]
    #[account(mut, name = "obligation")]
    #[account(name = "supply_reserve")]
    #[account(mut, name = "supply_collateral_token_account")]
    #[account(name = "supply_collateral_token_mint")]
    #[account(mut, name = "debt_liquidity_token_account")]
    #[account(name = "debt_liquidity_token_mint")]
    SolendOpenPosition(Option<PositionData>),

    /// Update solauto position settings. Can only be invoked by position authority
    #[account(signer, mut, name = "signer")]
    #[account(mut, name = "solauto_position")]
    UpdatePosition(SolautoSettingsParameters),

    /// Refresh Marginfi accounts & position data
    #[account(signer, name = "signer")]
    #[account(name = "marginfi_program")]
    #[account(mut, optional, name = "solauto_position")]
    // TODO missing accounts
    MarginfiRefreshData,

    /// Refresh Solend accounts & position data
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

    /// Marginfi protocol interaction. Can only be invoked by the authority of the position
    #[account(signer, mut, name = "signer")]
    #[account(name = "marginfi_program")]
    #[account(name = "ix_sysvar")]
    #[account(mut, optional, name = "solauto_position")]
    // TODO missing accounts
    MarginfiProtocolInteraction(SolautoAction),

    /// Solend protocol interaction. Can only be invoked by the authority of the position
    #[account(signer, mut, name = "signer")]
    #[account(name = "solend_program")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(name = "ata_program")]
    #[account(name = "clock")]
    #[account(name = "rent")]
    #[account(name = "solauto_admin_settings")]
    #[account(mut, name = "solauto_fees_receiver")]
    #[account(mut, optional, name = "solauto_position")]
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
    SolendProtocolInteraction(SolautoAction),

    /// Rebalance position.
    /// Takes an optional target utilization rate bps. Only allowed if the signer is the position authority - otherwise the instruction will look at the solauto position settings
    #[account(signer, mut, name = "signer")]
    #[account(name = "marginfi_program")]
    #[account(name = "ix_sysvar")]
    #[account(name = "solauto_admin_settings")]
    #[account(mut, name = "solauto_fees_receiver")]
    #[account(mut, optional, name = "solauto_position")]
    // TODO missing accounts
    MarginfiRebalance(OptionalLiqUtilizationRateBps),
    
    /// Rebalance position.
    /// Takes an optional target utilization rate bps. Only allowed if the signer is the position authority - otherwise the instruction will look at the solauto position settings
    #[account(signer, mut, name = "signer")]
    #[account(name = "solend_program")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(name = "ata_program")]
    #[account(name = "clock")]
    #[account(name = "rent")]
    #[account(name = "ix_sysvar")]
    #[account(name = "solauto_admin_settings")]
    #[account(mut, name = "solauto_fees_receiver")]
    #[account(mut, optional, name = "solauto_position")]
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
    SolendRebalance(OptionalLiqUtilizationRateBps),
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct PositionData {
    /// ID of the Solauto position
    pub position_id: u8,
    /// Setting parameters for the position
    pub setting_params: SolautoSettingsParameters,
    /// Marginfi-specific data for the position
    pub marginfi_data: Option<MarginfiPositionData>,
    /// Solend-specific data for the position
    pub solend_data: Option<SolendPositionData>,
    /// Kamino-specific data for the position
    pub kamino_data: Option<KaminoPositionData>,
}

pub type OptionalLiqUtilizationRateBps = Option<u16>;
