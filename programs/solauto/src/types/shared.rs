use borsh::{BorshDeserialize, BorshSerialize};
use bytemuck::AnyBitPattern;
use bytemuck::Pod;
use bytemuck::Zeroable;
use shank::ShankType;
use solana_program::msg;
use solana_program::pubkey::Pubkey;
use solana_program::{
    account_info::AccountInfo,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
};
use std::fmt;

use crate::derive_pod_traits;

use super::errors::SolautoError;

#[repr(u8)]
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, Default, PartialEq, Copy)]
pub enum LendingPlatform {
    #[default]
    Marginfi,
}
derive_pod_traits!(LendingPlatform);

#[repr(u8)]
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, Default, PartialEq, Copy)]
pub enum PositionType {
    #[default]
    Leverage,
    SafeLoan,
}
derive_pod_traits!(PositionType);

#[repr(u8)]
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, Default, PartialEq, Copy)]
pub enum TokenType {
    #[default]
    Supply,
    Debt,
}
derive_pod_traits!(TokenType);

impl fmt::Display for TokenType {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            TokenType::Supply => write!(f, "supply"),
            TokenType::Debt => write!(f, "debt"),
        }
    }
}

#[repr(u8)]
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, Default, PartialEq, Copy)]
pub enum RebalanceDirection {
    #[default]
    None,
    Boost,
    Repay,
}
derive_pod_traits!(RebalanceDirection);

#[repr(u8)]
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, Default, PartialEq, Copy)]
pub enum RebalanceStep {
    #[default]
    PreSwap,
    PostSwap,
}
derive_pod_traits!(RebalanceStep);

#[repr(u8)]
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, Default, PartialEq, Copy)]
pub enum SolautoRebalanceType {
    #[default]
    Regular,
    DoubleRebalanceWithFL,
    FLSwapThenRebalance,
    FLRebalanceThenSwap,
}
derive_pod_traits!(SolautoRebalanceType);

#[repr(u8)]
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, Default, PartialEq, Copy)]
pub enum SwapType {
    #[default]
    ExactIn,
    ExactOut,
}
derive_pod_traits!(SwapType);

#[derive(Debug)]
pub struct RefreshedTokenState {
    pub mint: Pubkey,
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
    pub supply: RefreshedTokenState,
    pub debt: RefreshedTokenState,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub enum TokenBalanceAmount {
    Some(u64),
    All,
}

pub struct SplTokenTransferArgs<'a, 'b> {
    pub source: &'a AccountInfo<'a>,
    pub authority: &'a AccountInfo<'a>,
    pub recipient: &'a AccountInfo<'a>,
    pub amount: u64,
    pub authority_seeds: Option<&'b Vec<&'b [u8]>>,
}

#[derive(Clone)]
pub struct BareSplTokenTransferArgs {
    pub from_wallet: Pubkey,
    pub from_wallet_ta: Pubkey,
    pub to_wallet_ta: Pubkey,
    pub amount: u64,
}

#[repr(C)]
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, Default, PartialEq, Copy)]
pub struct PodBool {
    pub val: bool,
}

derive_pod_traits!(PodBool);

impl PodBool {
    pub fn new(val: bool) -> Self {
        Self { val }
    }
}

#[repr(u8)]
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, Default, PartialEq, Copy)]
pub enum PriceType {
    #[default]
    Realtime,
    Ema,
}

impl fmt::Display for PriceType {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            PriceType::Realtime => write!(f, "realtime"),
            PriceType::Ema => write!(f, "Ema"),
        }
    }
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
