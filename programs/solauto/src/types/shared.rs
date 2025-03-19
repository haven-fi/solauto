use borsh::{ BorshDeserialize, BorshSerialize };
use bytemuck::AnyBitPattern;
use bytemuck::Pod;
use bytemuck::Zeroable;
use shank::ShankType;
use solana_program::msg;
use solana_program::pubkey::Pubkey;
use solana_program::{
    account_info::AccountInfo,
    program_error::ProgramError,
    program_pack::{ IsInitialized, Pack },
};
use std::fmt;

use crate::create_enum;
use super::errors::SolautoError;

create_enum!(LendingPlatform {
    Marginfi,
});

create_enum!(PositionType {
    Leverage,
    SafeLoan,
});

create_enum!(TokenType {
    Supply,
    Debt,
});

impl fmt::Display for TokenType {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            TokenType::Supply => write!(f, "supply"),
            TokenType::Debt => write!(f, "debt"),
        }
    }
}

create_enum!(RebalanceDirection {
    None,
    Boost,
    Repay,
});

create_enum!(RebalanceStep {
    First,
    Final,
});

create_enum!(SolautoRebalanceType {
    None,
    Regular,
    DoubleRebalanceWithFL,
    FLSwapThenRebalance,
    FLRebalanceThenSwap,
});

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

#[derive(Debug)]
pub struct RefreshedTokenState {
    pub mint: Pubkey,
    pub decimals: u8,
    pub amount_used: u64,
    pub amount_can_be_used: u64,
    pub market_price: f64,
    pub borrow_fee_bps: Option<u16>,
    pub flash_loan_fee_bps: Option<u16>,
}

#[derive(Debug)]
pub struct RefreshStateProps {
    pub max_ltv: f64,
    pub liq_threshold: f64,
    pub supply: RefreshedTokenState,
    pub debt: RefreshedTokenState,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub enum TokenBalanceAmount {
    Some(u64),
    All,
}

#[derive(Clone)]
pub struct DeserializedAccount<'a, T> {
    pub account_info: &'a AccountInfo<'a>,
    pub data: Box<T>,
}

impl<'a, T: AnyBitPattern> DeserializedAccount<'a, T> {
    pub fn zerocopy(account: Option<&'a AccountInfo<'a>>) -> Result<Option<Self>, ProgramError> {
        match account {
            Some(account_info) =>
                Ok(
                    Some(Self {
                        account_info,
                        data: Box::new(*bytemuck::from_bytes::<T>(&account_info.data.borrow())),
                    })
                ),
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
