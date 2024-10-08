use borsh::{BorshDeserialize, BorshSerialize};
use bytemuck::AnyBitPattern;
use bytemuck::Pod;
use bytemuck::Zeroable;
use shank::ShankType;
use solana_program::msg;
use solana_program::{
    account_info::AccountInfo,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
};
use std::fmt;
use thiserror::Error;

#[repr(u8)]
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, PartialEq, Copy)]
pub enum LendingPlatform {
    Marginfi,
}

unsafe impl Zeroable for LendingPlatform {}
unsafe impl Pod for LendingPlatform {}

impl Default for LendingPlatform {
    fn default() -> Self {
        LendingPlatform::Marginfi
    }
}

#[repr(C)]
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, PartialEq, Copy)]
pub struct PodBool {
    pub val: bool,
}

unsafe impl Zeroable for PodBool {}
unsafe impl Pod for PodBool {}

impl PodBool {
    pub fn new(val: bool) -> Self {
        Self { val }
    }
}

#[repr(u8)]
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, PartialEq, Copy)]
pub enum PositionType {
    Leverage,
    SafeLoan,
}

unsafe impl Zeroable for PositionType {}
unsafe impl Pod for PositionType {}

impl Default for PositionType {
    fn default() -> Self {
        PositionType::Leverage
    }
}

#[repr(u8)]
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, PartialEq, Copy)]
pub enum TokenType {
    Supply,
    Debt,
}

unsafe impl Zeroable for TokenType {}
unsafe impl Pod for TokenType {}

impl Default for TokenType {
    fn default() -> Self {
        TokenType::Supply
    }
}

impl fmt::Display for TokenType {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            TokenType::Supply => write!(f, "supply"),
            TokenType::Debt => write!(f, "debt"),
        }
    }
}

#[derive(Debug)]
pub struct RefreshedTokenData {
    pub decimals: u8,
    pub amount_used: u64,
    pub amount_can_be_used: u64,
    pub market_price: f64,
    pub borrow_fee_bps: Option<u16>,
}

#[derive(Debug)]
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

#[derive(Debug, PartialEq)]
pub enum RebalanceStep {
    Initial,
    Final,
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

impl<'a, T: Pack + IsInitialized> DeserializedAccount<'a, T> {
    pub fn unpack(account: Option<&'a AccountInfo<'a>>) -> Result<Option<Self>, ProgramError> {
        match account {
            Some(account_info) => {
                let deserialized_data = T::unpack(&account_info.data.borrow()).map_err(|_| {
                    msg!("Failed to deserialize account data");
                    SolautoError::FailedAccountDeserialization
                })?;
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
    #[error("Failed to deserialize account data")]
    FailedAccountDeserialization,
    #[error("Invalid position settings provided")]
    InvalidPositionSettings,
    #[error("Invalid DCA configuration provided")]
    InvalidDCASettings,
    #[error("Invalid automation settings provided")]
    InvalidAutomationData,
    #[error("Invalid position condition to rebalance")]
    InvalidRebalanceCondition,
    #[error("Unable to invoke instruction through a CPI")]
    InstructionIsCPI,
    #[error("Incorrect set of instructions in the transaction")]
    IncorrectInstructions,
    #[error("Incorrect swap amount provided. Likely due to high price volatility")]
    IncorrectDebtAdjustment,
}

impl From<SolautoError> for ProgramError {
    fn from(e: SolautoError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
