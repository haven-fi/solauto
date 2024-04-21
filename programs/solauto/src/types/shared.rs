use borsh::{ BorshDeserialize, BorshSerialize };
use shank::{ ShankAccount, ShankType };
use solana_program::{
    account_info::AccountInfo,
    program_error::ProgramError,
    program_pack::{ IsInitialized, Pack },
    pubkey::Pubkey,
};
use thiserror::Error;

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, PartialEq)]
#[borsh(use_discriminant = true)]
pub enum LendingPlatform {
    Marginfi,
    Solend,
    Kamino,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Copy, Debug, ShankType, PartialEq)]
pub enum DCADirection {
    /// Base unit amount to DCA in with
    In(u64),
    Out,
}

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
    pub protocol_position: Pubkey,
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
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType)]
pub struct PositionData {
    pub state: PositionState,
    pub lending_platform: LendingPlatform,
    pub protocol_data: Option<LendingProtocolPositionData>,
    pub setting_params: SolautoSettingsParameters,
    pub active_dca: Option<DCASettings>,
    pub supply_balance: u64,
    pub debt_balance: u64,
}

pub const POSITION_ACCOUNT_SPACE: usize = 500;
#[derive(ShankAccount, BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct PositionAccount {
    pub position_id: u8,
    pub authority: Pubkey,
    pub self_managed: bool,
    pub position: Option<PositionData>,
}

pub const REFERRAL_ACCOUNT_SPACE: usize = 300;
#[derive(ShankAccount, BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct ReferralStateAccount {
    pub authority: Pubkey,
    pub referred_by_state: Option<Pubkey>,
    pub fees_mint: Pubkey,
    pub dest_fees_ta: Pubkey,
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
                let deserialized_data = T::try_from_slice(&account_info.data.borrow()).map_err(
                    |_| SolautoError::FailedAccountDeserialization
                )?;
                Ok(
                    Some(Self {
                        account_info,
                        data: Box::new(deserialized_data),
                    })
                )
            }
            None => Ok(None),
        }
    }
}

impl<'a, T: Pack + IsInitialized> DeserializedAccount<'a, T> {
    pub fn unpack(account: Option<&'a AccountInfo<'a>>) -> Result<Option<Self>, ProgramError> {
        match account {
            Some(account_info) => {
                let deserialized_data = T::unpack(&account_info.data.borrow()).map_err(
                    |_| SolautoError::FailedAccountDeserialization
                )?;
                Ok(
                    Some(Self {
                        account_info,
                        data: Box::new(deserialized_data),
                    })
                )
            }
            None => Ok(None),
        }
    }
}

#[derive(Error, Debug)]
pub enum SolautoError {
    #[error("Incorrect Solauto position given the other accounts provided")]
    InvalidSolautoPositionAccount,
    #[error("Incorrect fee receiver account provided")]
    IncorrectFeesReceiverAccount,
    #[error("Missing required accounts for the given instruction")]
    MissingRequiredAccounts,
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
