use borsh::{BorshDeserialize, BorshSerialize};
use shank::{ShankAccount, ShankType};
use solana_program::{
    account_info::AccountInfo,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
    rent::ACCOUNT_STORAGE_OVERHEAD,
};
use std::fmt;
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

#[derive(BorshDeserialize, BorshSerialize, Clone, Copy, Debug, ShankType, PartialEq)]
pub enum DCADirection {
    /// Base unit amount of debt to DCA-in with
    In(u64),
    Out,
}

// TODO: what about DCAing-in when you already have supply in there, and we instead dial-up the boost parameters?
// TODO: also dial-up the boost_to parameter gradually when doing a DCA-in. Change boost_from and repay_from parameters to boost_gap and repay_gap,
// so all we need to provide here is a target boost_to parameter (when DCAing-in)
// When validating DCA settings ensure if DCAing-in that the current boost to parameter is lower than target boost to parameter
// We can use this "target boost to parameter" in a DCA-out too ^^^ 
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType)]
pub struct DCASettings {
    /// The unix timestamp (in seconds) start date of DCA
    pub unix_start_date: u64,
    /// The unix timestamp (in seconds) interval between each rebalance
    pub unix_dca_interval: u64,
    /// How many DCA periods have already passed
    pub dca_periods_passed: u8,
    /// The target number of DCA periods
    pub target_dca_periods: u8,
    /// Whether to DCA-in or DCA-out
    pub dca_direction: DCADirection,
    /// Only used when DCAing-in. A value to determine whether or not to increase leverage, or simply swap and deposit supply,
    /// depending on the distance from `current_liq_utilization_rate` to `repay_from` parameter.
    /// e.g. a lower value will mean the DCA will more likely increase leverage than not, and vice-versa.
    /// Defaults to 1500.
    pub dca_risk_aversion_bps: Option<u16>,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType)]
pub struct SolautoSettingsParameters {
    /// At which liquidation utilization rate or higher to begin a rebalance
    pub repay_from_bps: u16,
    /// At which liquidation utilization rate to finish a rebalance
    pub repay_to_bps: u16,
    /// At which liquidation utilization rate or lower to begin boosting leverage
    pub boost_from_bps: u16,
    /// At which liquidation utilization rate to boost leverage to
    pub boost_to_bps: u16,
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
    pub net_worth_usd_base_amount: u64,
    pub base_amount_liquidity_net_worth: u64,
    pub base_amount_supplied: u64,
    pub base_amount_borrowed: u64,
    pub max_ltv_bps: u64,
    pub liq_threshold: u64,
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

pub const POSITION_ACCOUNT_SPACE: usize = (ACCOUNT_STORAGE_OVERHEAD as usize) + 500; // TODO fix me
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankAccount)]
pub struct SolautoPosition {
    pub position_id: u8,
    _position_id_arr: [u8; 1],
    pub authority: Pubkey,
    pub self_managed: bool,
    pub position: Option<PositionData>,
}

impl SolautoPosition {
    pub fn new(position_id: u8, authority: Pubkey, position: Option<PositionData>) -> Self {
        Self {
            position_id,
            _position_id_arr: [position_id],
            authority,
            self_managed: position_id == 0,
            position,
        }
    }
    pub fn seeds<'a, 'b>(&'a self) -> Vec<&'a [u8]> {
        vec![&self._position_id_arr, self.authority.as_ref()]
    }
}

pub const REFERRAL_ACCOUNT_SPACE: usize = (ACCOUNT_STORAGE_OVERHEAD as usize) + 97; // 32 + 33 + 32
#[derive(ShankAccount, BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct ReferralStateAccount {
    pub authority: Pubkey,
    pub referred_by_state: Option<Pubkey>,
    pub dest_fees_mint: Pubkey,
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
