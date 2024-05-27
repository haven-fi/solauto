use borsh::{BorshDeserialize, BorshSerialize};
use bytemuck::AnyBitPattern;
use num_traits::{FromPrimitive, ToPrimitive};
use shank::{ShankAccount, ShankType};
use solana_program::{
    account_info::AccountInfo,
    msg,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
};
use std::{
    fmt,
    ops::{Add, Div, Mul, Sub},
};
use thiserror::Error;

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, PartialEq)]
pub enum LendingPlatform {
    Marginfi,
    Solend,
    Kamino,
}

impl Default for LendingPlatform {
    fn default() -> Self {
        LendingPlatform::Marginfi
    }
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

pub struct RefreshedTokenData {
    pub amount_used: u64,
    pub amount_can_be_used: u64,
    pub market_price: f64,
    pub decimals: u8,
    pub borrow_fee_bps: Option<u16>,
}

pub struct RefreshStateProps {
    pub max_ltv: f64,
    pub liq_threshold: f64,
    pub supply: RefreshedTokenData,
    pub debt: RefreshedTokenData,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub enum TokenBalanceAmount {
    Some(u64),
    All,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Copy, Debug, ShankType, Default)]
pub struct AutomationSettings {
    /// The unix timestamp (in seconds) start date of DCA
    pub unix_start_date: u64,
    /// The interval in seconds between each DCA
    pub interval_seconds: u64,
    /// How many periods have already passed
    pub periods_passed: u16,
    /// The target number of periods
    pub target_periods: u16,
}

impl AutomationSettings {
    pub fn eligible_for_next_period(&self, current_unix_timestamp: u64) -> bool {
        if self.periods_passed == 0 {
            true
        } else {
            current_unix_timestamp
                >= self
                    .unix_start_date
                    .add(self.interval_seconds.mul((self.periods_passed as u64) + 1))
        }
    }
    pub fn updated_amount_from_automation<T: ToPrimitive + FromPrimitive>(
        &self,
        curr_amt: T,
        target_amt: T,
    ) -> Option<T> {
        let curr_amt_i64 = curr_amt.to_i64()?;
        let target_amt_i64 = target_amt.to_i64()?;
        let current_rate_diff = (curr_amt_i64 - target_amt_i64) as f64;
        let progress_pct = (1.0).div((self.target_periods as f64).sub(self.periods_passed as f64));
        let new_amt = curr_amt.to_f64()? - current_rate_diff * progress_pct;

        T::from_f64(new_amt)
    }
}

#[derive(ShankAccount, BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct ReferralState {
    _bump: [u8; 1],
    pub authority: Pubkey,
    pub referred_by_state: Option<Pubkey>,
    pub dest_fees_mint: Pubkey,
    _padding: [u8; 128],
}

impl ReferralState {
    pub const LEN: usize = 226;
    pub fn new(
        authority: Pubkey,
        referred_by_state: Option<Pubkey>,
        dest_fees_mint: Pubkey,
    ) -> Self {
        let (_, bump) =
            Pubkey::find_program_address(&ReferralState::seeds(&authority).as_slice(), &crate::ID);
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
        let mut seeds = ReferralState::seeds(&self.authority);
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

impl<'a, T: AnyBitPattern> DeserializedAccount<'a, T> {
    pub fn zerocopy(account: Option<&'a AccountInfo<'a>>) -> Result<Option<Self>, ProgramError> {
        match account {
            Some(account_info) => Ok(Some(Self {
                account_info,
                data: Box::new(*bytemuck::from_bytes::<T>(&account_info.data.borrow())),
            })),
            None => Ok(None),
        }
    }
}

impl<'a, T: BorshDeserialize> DeserializedAccount<'a, T> {
    pub fn deserialize(account: Option<&'a AccountInfo<'a>>) -> Result<Option<Self>, ProgramError> {
        match account {
            Some(account_info) => {
                let mut data: &[u8] = &(*account_info.data).borrow();
                Ok(Some(Self {
                    account_info,
                    data: Box::new(
                        T::deserialize(&mut data)
                            .map_err(|_| SolautoError::FailedAccountDeserialization)?,
                    ),
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
    #[error("Invalid position settings given")]
    InvalidPositionSettings,
    #[error("Invalid DCA settings given")]
    InvalidDCASettings,
    #[error("Invalid automation data given")]
    InvalidAutomationData,
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
