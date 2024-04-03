use thiserror::Error;
use borsh;
use borsh::{ BorshDeserialize, BorshSerialize };
use shank::{ ShankAccount, ShankType };
use solana_program::{
    account_info::AccountInfo,
    program_error::ProgramError,
    program_pack::{ IsInitialized, Pack },
    pubkey::Pubkey,
};

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType)]
pub enum ProtocolAction {
    Deposit(ProtocolActionDetails),
    Borrow(ProtocolActionDetails),
    Repay(ProtocolActionDetails),
    Withdraw(ProtocolActionDetails),
    ClosePosition,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType)]
pub struct ProtocolActionDetails {
    /// Amount of liquidity to use when taking the action
    pub action_amount: u64,
    /// Whether to rebalance to a specific utilization after taking the action
    pub rebalance_utilization_rate_bps: Option<u16>,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType)]
#[borsh(use_discriminant = true)]
pub enum LendingPlatform {
    Solend = 0,
    Kamino = 1,
    Marginfi = 2,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType)]
pub struct SolautoSettingsParameters {
    pub repay_from_bps: u16,
    pub repay_to_bps: u16,
    pub boost_from_bps: u16,
    pub boost_to_bps: u16,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType)]
pub struct SolendPositionData {
    pub supply_reserve: Pubkey,
    pub debt_reserve: Option<Pubkey>,
    pub obligation: Pubkey,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, Default)]
pub struct GeneralPositionData {
    pub utilization_rate_bps: u16,
    pub net_worth_usd_base_amount: u64,
    pub base_amount_liquidity_net_worth: u64,
    pub base_amount_supplied: u64,
    pub base_amount_borrowed: u64,
}

pub const POSITION_LEN: usize = 500;
#[derive(ShankAccount, BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct Position {
    pub position_id: u8,
    pub authority: Pubkey,
    pub lending_platform: LendingPlatform,
    pub setting_params: SolautoSettingsParameters,
    pub general_data: GeneralPositionData,
    pub solend_data: Option<SolendPositionData>,
}

#[derive(ShankAccount, BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct PositionsManager {
    pub  open_positions: Vec<Pubkey>,
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
    #[error("Invalid position data given")]
    InvalidPositionSettings,
    #[error("Failed to deserialize account data, incorrect account was likely given")]
    FailedAccountDeserialization,
    #[error("Stale protocol data. Refresh instruction must be invoked before taking a protocol action")]
    StaleProtocolData,
    #[error("Incorrect fee receiver account provided")]
    IncorrectFeeReceiver,
    #[error("Missing required accounts for the given instruction")]
    MissingRequiredAccounts
}

impl From<SolautoError> for ProgramError {
    fn from(e: SolautoError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
