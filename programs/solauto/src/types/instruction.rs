use borsh::{ BorshDeserialize, BorshSerialize };
use shank::{ ShankContext, ShankInstruction };
use solana_program::account_info::AccountInfo;

use super::shared::*;

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankContext, ShankInstruction)]
#[rustfmt::skip]
pub enum Instruction {
    /// Moves the referral fees to an intermediary token account, where a jup swap will convert to the destination token mint
    #[account(signer, mut, name = "solauto_manager")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(name = "ata_program")]
    #[account(name = "rent")]
    #[account(name = "ixs_sysvar")]
    #[account(name = "referral_state")]
    #[account(mut, name = "referral_fees_ta")]
    #[account(mut, name = "intermediary_ta")]
    ConvertReferralFees,

    /// Claim the accumulated fees from referrals
    #[account(signer, mut, name = "signer")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(name = "rent")]
    #[account(name = "referral_state")]
    #[account(mut, name = "referral_fees_ta")]
    #[account(mut, name = "referral_fees_mint")]
    #[account(mut, optional, name = "dest_ta")]
    ClaimReferralFees,

    /// Open a new Solauto position with Marginfi
    #[account(signer, mut, name = "signer")]
    #[account(name = "marginfi_program")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(name = "ata_program")]
    #[account(name = "rent")]
    #[account(name = "solauto_fees_wallet")]
    #[account(name = "solauto_fees_supply_ta")]
    #[account(mut, name = "signer_referral_state")]
    #[account(mut, name = "referral_fees_mint")]
    #[account(mut, name = "signer_referral_dest_ta")]
    #[account(mut, optional, name = "referred_by_state")]
    #[account(optional, name = "referred_by_authority")]
    #[account(mut, optional, name = "referred_by_dest_ta")]
    #[account(mut, optional, name = "referred_by_supply_ta")]
    #[account(mut, name = "solauto_position")]
    #[account(name = "marginfi_group")]
    #[account(mut, name = "marginfi_account")]
    #[account(mut, optional, name = "signer_supply_ta")]
    #[account(mut, name = "position_supply_ta")]
    #[account(name = "supply_mint")]
    #[account(mut, name = "position_debt_ta")]
    #[account(name = "debt_mint")]
    MarginfiOpenPosition(UpdatePositionData),

    /// Open a new Solauto position with Solend
    #[account(signer, mut, name = "signer")]
    #[account(name = "solend_program")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(name = "ata_program")]
    #[account(name = "rent")]
    #[account(name = "solauto_fees_wallet")]
    #[account(name = "solauto_fees_supply_ta")]
    #[account(mut, name = "signer_referral_state")]
    #[account(mut, name = "referral_fees_mint")]
    #[account(mut, name = "signer_referral_dest_ta")]
    #[account(mut, optional, name = "referred_by_state")]
    #[account(optional, name = "referred_by_authority")]
    #[account(mut, optional, name = "referred_by_dest_ta")]
    #[account(mut, optional, name = "referred_by_supply_ta")]
    #[account(mut, name = "solauto_position")]
    #[account(name = "lending_market")]
    #[account(mut, name = "obligation")]
    #[account(name = "supply_reserve")]
    #[account(mut, optional, name = "signer_supply_liquidity_ta")]
    #[account(mut, name = "position_supply_liquidity_ta")]
    #[account(name = "supply_liquidity_mint")]
    #[account(mut, name = "position_supply_collateral_ta")]
    #[account(name = "supply_collateral_mint")]
    #[account(mut, name = "position_debt_liquidity_ta")]
    #[account(name = "debt_liquidity_mint")]
    SolendOpenPosition(UpdatePositionData),

    /// Update solauto position settings. Can only be invoked by position authority
    #[account(signer, name = "signer")]
    #[account(name = "token_program")]
    #[account(mut, name = "solauto_position")]
    #[account(mut, optional, name = "position_debt_ta")]
    #[account(mut, optional, name = "signer_debt_ta")]
    #[account(optional, name = "debt_mint")]
    UpdatePosition(UpdatePositionData),
    
    /// Close the Solauto position and return the rent for the various accounts
    #[account(signer, mut, name = "signer")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(mut, name = "solauto_position")]
    #[account(mut, name = "position_supply_liquidity_ta")]
    #[account(optional, mut, name = "position_supply_collateral_ta")]
    #[account(mut, name = "position_debt_liquidity_ta")]
    ClosePosition,

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
    #[account(mut, optional, name = "position_supply_liquidity_ta")]
    #[account(mut, optional, name = "position_debt_liquidity_ta")]
    SolendRefreshData,

    /// Marginfi protocol interaction. Can only be invoked by the authority of the position
    #[account(signer, mut, name = "signer")]
    #[account(name = "marginfi_program")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(name = "ata_program")]
    #[account(name = "rent")]
    #[account(mut, name = "solauto_position")]
    #[account(optional, name = "supply_mint")]
    #[account(mut, optional, name = "authority_supply_ta")]
    #[account(mut, optional, name = "bank_supply_ta")]
    #[account(optional, name = "debt_mint")]
    #[account(mut, optional, name = "authority_debt_ta")]
    #[account(mut, optional, name = "bank_debt_ta")]
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
    #[account(mut, name = "solauto_position")]
    #[account(name = "lending_market")]
    #[account(mut, name = "obligation")]
    #[account(mut, optional, name = "supply_reserve")]
    #[account(optional, name = "supply_reserve_pyth_price_oracle")]
    #[account(optional, name = "supply_reserve_switchboard_oracle")]
    #[account(optional, name = "supply_liquidity_mint")]
    #[account(mut, optional, name = "authority_supply_liquidity_ta")]
    #[account(mut, optional, name = "reserve_supply_liquidity_ta")]
    #[account(optional, name = "supply_collateral_mint")]
    #[account(mut, optional, name = "authority_supply_collateral_ta")]
    #[account(mut, optional, name = "reserve_supply_collateral_ta")]
    #[account(mut, optional, name = "debt_reserve")]
    #[account(mut, optional, name = "debt_reserve_fee_receiver_ta")]
    #[account(optional, name = "debt_liquidity_mint")]
    #[account(mut, optional, name = "authority_debt_liquidity_ta")]
    #[account(mut, optional, name = "reserve_debt_liquidity_ta")]
    SolendProtocolInteraction(SolautoAction),

    /// Rebalance the position, can be invoked by the authority or Solauto manager
    #[account(signer, mut, name = "signer")]
    #[account(name = "marginfi_program")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(name = "ata_program")]
    #[account(name = "rent")]
    #[account(name = "ixs_sysvar")]
    #[account(mut, name = "solauto_fees_supply_ta")]
    #[account(name = "authority_referral_state")]
    #[account(optional, name = "referred_by_state")]
    #[account(mut, optional, name = "referred_by_supply_ta")]
    #[account(mut, name = "solauto_position")]
    #[account(mut, name = "intermediary_ta")]
    #[account(name = "supply_mint")]
    #[account(mut, name = "position_supply_ta")]
    #[account(mut, name = "bank_supply_ta")]
    #[account(name = "debt_mint")]
    #[account(mut, name = "position_debt_ta")]
    #[account(mut, name = "bank_debt_ta")]
    // TODO missing accounts
    MarginfiRebalance(RebalanceArgs),
    
    /// Rebalance the position, can be invoked by the authority or Solauto manager
    #[account(signer, mut, name = "signer")]
    #[account(name = "solend_program")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(name = "ata_program")]
    #[account(name = "clock")]
    #[account(name = "rent")]
    #[account(name = "ixs_sysvar")]
    #[account(mut, name = "solauto_fees_supply_ta")]
    #[account(name = "authority_referral_state")]
    #[account(optional, name = "referred_by_state")]
    #[account(mut, optional, name = "referred_by_supply_ta")]
    #[account(mut, name = "solauto_position")]
    #[account(mut, name = "intermediary_ta")]
    #[account(name = "lending_market")]
    #[account(mut, name = "obligation")]
    #[account(mut, name = "supply_reserve")]
    #[account(name = "supply_reserve_pyth_price_oracle")]
    #[account(name = "supply_reserve_switchboard_oracle")]
    #[account(name = "supply_liquidity_mint")]
    #[account(mut, name = "position_supply_liquidity_ta")]
    #[account(mut, name = "reserve_supply_liquidity_ta")]
    #[account(name = "supply_collateral_mint")]
    #[account(mut, name = "position_supply_collateral_ta")]
    #[account(mut, name = "reserve_supply_collateral_ta")]
    #[account(mut, name = "debt_reserve")]
    #[account(mut, name = "debt_reserve_fee_receiver_ta")]
    #[account(name = "debt_liquidity_mint")]
    #[account(mut, name = "position_debt_liquidity_ta")]
    #[account(mut, name = "reserve_debt_liquidity_ta")]
    SolendRebalance(RebalanceArgs),
}

pub const SOLAUTO_REBALANCE_IX_DISCRIMINATORS: [u64; 2] = [10, 11];

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct UpdatePositionData {
    /// ID of the Solauto position
    pub position_id: u8,
    /// Setting parameters for the position
    pub setting_params: Option<SolautoSettingsParameters>,
    /// Protocol-specific data for the position
    pub protocol_data: Option<LendingProtocolPositionData>,
    /// New DCA data to initiate on the position
    pub active_dca: Option<DCASettings>,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub enum SolautoAction {
    /// Provide the base unit amount to deposit
    Deposit(u64),
    /// Provide the base unit amount to borrow
    Borrow(u64),
    /// Provide the base unit amount to repay
    Repay(u64),
    /// Provide the amount to withdraw. Can withdraw partial or all
    Withdraw(WithdrawParams),
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub enum WithdrawParams {
    All,
    /// Provide the amount to withdraw in the base unit
    Partial(u64),
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct RebalanceArgs {
    /// Target liq utilization rate. Only used/allowed if rebalancing a self-managed position
    pub target_liq_utilization_rate_bps: Option<u16>,
    /// Max price slippage bps. Only used/allowed by the Solauto rebalancer account or position authority
    pub max_price_slippage_bps: Option<u16>,
}

pub struct SolautoStandardAccounts<'a> {
    pub signer: &'a AccountInfo<'a>,
    pub lending_protocol: &'a AccountInfo<'a>,
    pub system_program: &'a AccountInfo<'a>,
    pub token_program: &'a AccountInfo<'a>,
    pub ata_program: &'a AccountInfo<'a>,
    pub rent: &'a AccountInfo<'a>,
    pub ixs_sysvar: Option<&'a AccountInfo<'a>>,
    pub solauto_position: DeserializedAccount<'a, PositionAccount>,
    pub solauto_fees_supply_ta: Option<&'a AccountInfo<'a>>,
    pub authority_referral_state: Option<DeserializedAccount<'a, ReferralStateAccount>>,
    pub referred_by_state: Option<&'a AccountInfo<'a>>,
    pub referred_by_supply_ta: Option<&'a AccountInfo<'a>>,
}
