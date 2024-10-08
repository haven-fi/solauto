use borsh::BorshDeserialize;
use shank::{ShankContext, ShankInstruction, ShankType};
use solana_program::{account_info::AccountInfo, pubkey::Pubkey};

use crate::state::{
    referral_state::ReferralState,
    solauto_position::{
        DCASettingsInp, SolautoPosition, SolautoRebalanceType, SolautoSettingsParametersInp,
    },
};

use super::shared::*;

#[derive(BorshDeserialize, Clone, Debug, ShankContext, ShankInstruction)]
#[rustfmt::skip]
pub enum Instruction {
    /// Create or update referral state data
    #[account(signer, name = "signer")]
    #[account(name = "system_program")]
    #[account(name = "rent")]
    #[account(mut, name = "signer_referral_state")]
    #[account(mut, optional, name = "referred_by_state")]
    #[account(optional, name = "referred_by_authority")]
    UpdateReferralStates(UpdateReferralStatesArgs),

    /// Moves the referral fees to an intermediary token account, where a jup swap will convert to the destination token mint
    #[account(signer, name = "signer")]
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
    #[account(signer, name = "signer")]
    #[account(mut, optional, name = "signer_wsol_ta")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(name = "rent")]
    #[account(name = "referral_state")]
    #[account(mut, name = "referral_fees_dest_ta")]
    #[account(name = "referral_fees_dest_mint")]
    #[account(mut, optional, name = "referral_authority")]
    #[account(mut, optional, name = "fees_destination_ta")]
    ClaimReferralFees,

    /// Update solauto position settings. Can only be invoked by position authority
    #[account(signer, name = "signer")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(mut, name = "solauto_position")]
    #[account(optional, name = "dca_mint")]
    #[account(mut, optional, name = "position_dca_ta")]
    #[account(mut, optional, name = "signer_dca_ta")]
    UpdatePosition(UpdatePositionData),
    
    /// Close the Solauto position and return the rent for the various accounts
    #[account(signer, name = "signer")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(name = "ata_program")]
    #[account(mut, name = "solauto_position")]
    #[account(mut, name = "protocol_account")]
    #[account(mut, name = "position_supply_ta")]
    #[account(mut, name = "signer_supply_ta")]
    #[account(mut, name = "position_debt_ta")]
    #[account(mut, name = "signer_debt_ta")]
    ClosePosition,

    /// Cancel an active DCA on a Solauto position
    #[account(signer, name = "signer")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(name = "ata_program")]
    #[account(mut, name = "solauto_position")]
    #[account(optional, name = "dca_mint")]
    #[account(mut, optional, name = "position_dca_ta")]
    #[account(mut, optional, name = "signer_dca_ta")]
    CancelDCA,

    /// Open a new Solauto position with Marginfi
    #[account(signer, name = "signer")]
    #[account(name = "marginfi_program")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(name = "ata_program")]
    #[account(name = "rent")]
    #[account(name = "solauto_fees_wallet")]
    #[account(mut, name = "solauto_fees_supply_ta")]
    #[account(name = "signer_referral_state")]
    #[account(optional, name = "referred_by_state")]
    #[account(mut, optional, name = "referred_by_supply_ta")]
    #[account(mut, name = "solauto_position")]
    #[account(name = "marginfi_group")]
    #[account(mut, optional_signer, name = "marginfi_account")]
    #[account(name = "supply_mint")]
    #[account(name = "supply_bank")]
    #[account(mut, name = "position_supply_ta")]
    #[account(name = "debt_mint")]
    #[account(name = "debt_bank")]
    #[account(mut, name = "position_debt_ta")]
    #[account(mut, optional, name = "signer_debt_ta")]
    MarginfiOpenPosition(MarginfiOpenPositionData),

    /// Refresh Marginfi accounts & position data
    #[account(signer, name = "signer")]
    #[account(name = "marginfi_program")]
    #[account(name = "marginfi_group")]
    #[account(name = "marginfi_account")]
    #[account(mut, name = "supply_bank")]
    #[account(name = "supply_price_oracle")]
    #[account(mut, name = "debt_bank")]
    #[account(name = "debt_price_oracle")]
    #[account(mut, name = "solauto_position")]
    MarginfiRefreshData,

    /// Marginfi protocol interaction. Can only be invoked by the authority of the position
    #[account(signer, name = "signer")]
    #[account(name = "marginfi_program")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(name = "ata_program")]
    #[account(name = "rent")]
    #[account(mut, name = "solauto_position")]
    #[account(name = "marginfi_group")]
    #[account(mut, name = "marginfi_account")]
    #[account(mut, name = "supply_bank")]
    #[account(optional, name = "supply_price_oracle")]
    #[account(mut, optional, name = "position_supply_ta")]
    #[account(mut, optional, name = "vault_supply_ta")]
    #[account(mut, optional, name = "supply_vault_authority")]
    #[account(mut, name = "debt_bank")]
    #[account(optional, name = "debt_price_oracle")]
    #[account(mut, optional, name = "position_debt_ta")]
    #[account(mut, optional, name = "vault_debt_ta")]
    #[account(mut, optional, name = "debt_vault_authority")]
    MarginfiProtocolInteraction(SolautoAction),

    /// Rebalance the position, can be invoked by the authority or Solauto manager
    #[account(signer, name = "signer")]
    #[account(name = "marginfi_program")]
    #[account(name = "system_program")]
    #[account(name = "token_program")]
    #[account(name = "ixs_sysvar")]
    #[account(mut, optional, name = "solauto_fees_supply_ta")]
    #[account(name = "authority_referral_state")]
    #[account(mut, optional, name = "referred_by_supply_ta")]
    #[account(mut, name = "position_authority")]
    #[account(mut, name = "solauto_position")]
    #[account(name = "marginfi_group")]
    #[account(mut, name = "marginfi_account")]
    #[account(optional, mut, name = "intermediary_ta")]
    #[account(mut, name = "supply_bank")]
    #[account(optional, name = "supply_price_oracle")]
    #[account(mut, name = "position_supply_ta")]
    #[account(mut, optional, name = "authority_supply_ta")]
    #[account(mut, optional, name = "vault_supply_ta")]
    #[account(mut, optional, name = "supply_vault_authority")]
    #[account(mut, name = "debt_bank")]
    #[account(optional, name = "debt_price_oracle")]
    #[account(mut, name = "position_debt_ta")]
    #[account(mut, optional, name = "authority_debt_ta")]
    #[account(mut, optional, name = "vault_debt_ta")]
    #[account(mut, optional, name = "debt_vault_authority")]
    MarginfiRebalance(RebalanceSettings),
}

pub const SOLAUTO_REBALANCE_IX_DISCRIMINATORS: [u8; 1] = [9];

#[derive(BorshDeserialize, Clone, Debug)]
pub struct UpdateReferralStatesArgs {
    /// The destination token mint to accumulate referral fees in
    pub referral_fees_dest_mint: Option<Pubkey>,
    /// Address lookup table to use for this user
    pub address_lookup_table: Option<Pubkey>,
}

#[derive(BorshDeserialize, Clone, Debug)]
pub struct MarginfiOpenPositionData {
    pub position_type: PositionType,
    pub position_data: UpdatePositionData,
    /// Marginfi account seed index if the position is Solauto-managed
    pub marginfi_account_seed_idx: Option<u64>,
}

#[derive(BorshDeserialize, Clone, Debug)]
pub struct UpdatePositionData {
    /// ID of the Solauto position
    pub position_id: u8,
    /// Setting parameters for the position
    pub setting_params: Option<SolautoSettingsParametersInp>,
    /// New DCA data to initiate on the position
    pub dca: Option<DCASettingsInp>,
}

#[derive(BorshDeserialize, Clone, Debug, PartialEq)]
pub enum SolautoAction {
    /// Provide the base unit amount to deposit
    Deposit(u64),
    /// Provide the base unit amount to borrow
    Borrow(u64),
    /// Provide the base unit amount to repay
    Repay(TokenBalanceAmount),
    /// Provide the amount to withdraw. Can withdraw partial or all
    Withdraw(TokenBalanceAmount),
}

#[derive(BorshDeserialize, Clone, Debug, Default, ShankType)]
pub struct RebalanceSettings {
    pub rebalance_type: SolautoRebalanceType,
    /// Target liq utilization rate. Only used/allowed if signed by the position authority.
    pub target_liq_utilization_rate_bps: Option<u16>,
    /// Target input amount. Only used/allowed if signed by the position authority.
    pub target_in_amount_base_unit: Option<u64>,
}

pub struct SolautoStandardAccounts<'a> {
    pub signer: &'a AccountInfo<'a>,
    pub lending_protocol: &'a AccountInfo<'a>,
    pub system_program: &'a AccountInfo<'a>,
    pub token_program: &'a AccountInfo<'a>,
    pub ata_program: Option<&'a AccountInfo<'a>>,
    pub rent: Option<&'a AccountInfo<'a>>,
    pub ixs_sysvar: Option<&'a AccountInfo<'a>>,
    pub solauto_position: DeserializedAccount<'a, SolautoPosition>,
    pub solauto_fees_supply_ta: Option<&'a AccountInfo<'a>>,
    pub authority_referral_state: Option<DeserializedAccount<'a, ReferralState>>,
    pub referred_by_state: Option<&'a AccountInfo<'a>>,
    pub referred_by_supply_ta: Option<&'a AccountInfo<'a>>,
}
