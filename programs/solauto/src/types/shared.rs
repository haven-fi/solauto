use borsh::{BorshDeserialize, BorshSerialize};
use shank::{ShankAccount, ShankType};
use solana_program::{
    account_info::AccountInfo,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
};
use std::{cmp::min, fmt, ops::{Add, Sub}};
use thiserror::Error;

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, PartialEq)]
pub enum LendingPlatform {
    Marginfi,
    Solend,
    Kamino,
}

#[derive(PartialEq)]
pub enum TokenType {
    Supply,
    Debt,
}

impl fmt::Display for TokenType {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            TokenType::Supply => write!(f, "supply"),
            TokenType::Debt => write!(f, "debt"),
        }
    }
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub enum TokenBalanceAmount {
    Some(u64),
    All,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Copy, Debug, ShankType, PartialEq)]
pub enum DCADirection {
    /// Base unit amount of debt to DCA-in with
    In(Option<u64>),
    Out,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType)]
pub struct DCASettings {
    /// The unix timestamp (in seconds) start date of DCA
    pub unix_start_date: u64,
    /// The interval in seconds between each DCA
    pub dca_interval_seconds: u64,
    /// How many DCA periods have already passed
    pub dca_periods_passed: u8,
    /// The target number of DCA periods
    pub target_dca_periods: u8,
    /// Whether to DCA-in or DCA-out
    pub dca_direction: DCADirection,
    /// Only used when DCAing-in and DCADirection::In value > 0. This value is used to determine whether or not to increase leverage,
    /// or simply swap and deposit supply, depending on the distance from `current_liq_utilization_rate` to `repay_from` parameter.
    /// e.g. a lower value will mean the DCA will more likely increase leverage than not, and vice-versa.
    /// Defaults to 1500.
    pub dca_risk_aversion_bps: Option<u16>,
    /// The taget boost_to_bps parameter to reach at the end of the DCA. Applicable for both DCA directions.
    pub target_boost_to_bps: Option<u16>,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType)]
pub struct SolautoSettingsParameters {
    /// At which liquidation utilization rate to boost leverage to
    pub boost_to_bps: u16,
    /// boost_gap basis points below boost_to_bps is the liquidation utilization rate at which to begin a rebalance
    pub boost_gap: u16,
    /// At which liquidation utilization rate to finish a rebalance
    pub repay_to_bps: u16,
    /// repay_gap basis points above repay_to_bps is the liquidation utilization rate at which to begin a rebalance
    pub repay_gap: u16,
}

impl SolautoSettingsParameters {
    pub fn boost_from_bps(&self) -> u16 {
        self.boost_to_bps.saturating_sub(self.boost_gap)
    }
    pub fn repay_from_bps(&self) -> u16 {
        self.repay_to_bps.add(self.repay_gap)
    }
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType)]
pub struct LendingProtocolPositionData {
    /// Marginfi: "marginfi_account", Solend: "obligation", Kamino: "obligation"
    pub protocol_account: Pubkey,
    /// The supply token mint
    pub supply_mint: Pubkey,
    /// The debt token mint
    pub debt_mint: Option<Pubkey>,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, Default)]
pub struct PositionState {
    pub liq_utilization_rate_bps: u16,
    pub net_worth_base_amount_usd: u64,
    pub net_worth_base_amount_supply_mint: u64,
    pub base_amount_supplied: u64,
    pub base_amount_borrowed: u64,
    pub max_ltv_bps: Option<u16>,
    pub liq_threshold_bps: u16,
    pub last_updated: u64,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType)]
pub struct PositionData {
    pub state: PositionState,
    pub lending_platform: LendingPlatform,
    pub protocol_data: LendingProtocolPositionData,
    pub setting_params: Option<SolautoSettingsParameters>,
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
    pub const LEN: usize = 359;
    pub fn new(position_id: u8, authority: Pubkey, position: Option<PositionData>) -> Self {
        let (_, bump) =
            Pubkey::find_program_address(&[&[position_id], authority.as_ref()], &crate::ID);
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

#[derive(ShankAccount, BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct ReferralStateAccount {
    _bump: [u8; 1],
    pub authority: Pubkey,
    pub referred_by_state: Option<Pubkey>,
    pub dest_fees_mint: Pubkey,
    _padding: [u8; 128],
}

impl ReferralStateAccount {
    pub const LEN: usize = 226;
    pub fn new(
        authority: Pubkey,
        referred_by_state: Option<Pubkey>,
        dest_fees_mint: Pubkey,
    ) -> Self {
        let (_, bump) = Pubkey::find_program_address(
            &ReferralStateAccount::seeds(&authority).as_slice(),
            &crate::ID,
        );
        Self {
            _bump: [bump],
            authority,
            referred_by_state,
            dest_fees_mint,
            _padding: [0; 128],
        }
    }
    pub fn seeds<'a>(authority: &'a Pubkey) -> Vec<&'a [u8]> {
        vec![b"referral_state", authority.as_ref()]
    }
    pub fn seeds_with_bump<'a>(&'a self) -> Vec<&'a [u8]> {
        let mut seeds = ReferralStateAccount::seeds(&self.authority);
        seeds.push(&self._bump);
        seeds
    }
}

#[derive(PartialEq)]
pub enum SolautoRebalanceStep {
    StartSolautoRebalanceSandwich,
    FinishSolautoRebalanceSandwich,
    StartMarginfiFlashLoanSandwich,
    FinishMarginfiFlashLoanSandwich,
    FinishStandardFlashLoanSandwich,
}

#[derive(Clone)]
pub struct DeserializedAccount<'a, T> {
    pub account_info: &'a AccountInfo<'a>,
    pub data: Box<T>,
}

impl<'a, T: BorshDeserialize> DeserializedAccount<'a, T> {
    pub fn deserialize(account: Option<&'a AccountInfo<'a>>) -> Result<Option<Self>, ProgramError> {
        match account {
            Some(account_info) => {
                let mut data: &[u8] = &(*account_info.data).borrow();
                let deserialized_data = T::deserialize(&mut data)
                    .map_err(|_| SolautoError::FailedAccountDeserialization)?;
                Ok(Some(Self {
                    account_info,
                    data: Box::new(deserialized_data),
                }))
            }
            None => Ok(None),
        }
    }
}

impl<'a, T: Pack + IsInitialized> DeserializedAccount<'a, T> {
    pub fn unpack(account: Option<&'a AccountInfo<'a>>) -> Result<Option<Self>, ProgramError> {
        match account {
            Some(account_info) => {
                let deserialized_data = T::unpack(&account_info.data.borrow())
                    .map_err(|_| SolautoError::FailedAccountDeserialization)?;
                Ok(Some(Self {
                    account_info,
                    data: Box::new(deserialized_data),
                }))
            }
            None => Ok(None),
        }
    }
}

#[derive(Error, Debug)]
pub enum SolautoError {
    #[error("Missing or incorrect accounts provided for the given instruction")]
    IncorrectAccounts,
    #[error("Failed to deserialize account data, incorrect account was likely given")]
    FailedAccountDeserialization,
    #[error("Invalid position data given")]
    InvalidPositionSettings,
    #[error("Invalid DCA data given")]
    InvalidDCASettings,
    #[error(
        "Stale protocol data. Refresh instruction must be invoked before taking a protocol action"
    )]
    StaleProtocolData,
    #[error("Unable to adjust position to the desired utilization rate")]
    UnableToReposition,
    #[error("Desired action brought the utilization rate to an unsafe amount")]
    ExceededValidUtilizationRate,
    #[error("Invalid position condition to rebalance")]
    InvalidRebalanceCondition,
    #[error("Unable to invoke instruciton through a CPI")]
    InstructionIsCPI,
    #[error("Too many rebalance instruction invocations in the same transaction")]
    RebalanceAbuse,
    #[error("Incorrect set of instructions in the transaction")]
    IncorrectInstructions,
}

impl From<SolautoError> for ProgramError {
    fn from(e: SolautoError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
