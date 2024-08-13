use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
};
use spl_token::state::Account as TokenAccount;

use super::{
    instruction::SolautoStandardAccounts,
    shared::{DeserializedAccount, TokenBalanceAmount},
};

#[derive(Clone)]
pub struct LendingProtocolTokenAccounts<'a> {
    pub mint: Option<&'a AccountInfo<'a>>,
    pub position_ta: Option<DeserializedAccount<'a, TokenAccount>>,
    pub signer_ta: Option<DeserializedAccount<'a, TokenAccount>>,
    pub protocol_ta: Option<&'a AccountInfo<'a>>,
}

impl<'a> LendingProtocolTokenAccounts<'a> {
    pub fn from(
        mint: Option<&'a AccountInfo<'a>>,
        position_ta: Option<&'a AccountInfo<'a>>,
        signer_ta: Option<&'a AccountInfo<'a>>,
        protocol_ta: Option<&'a AccountInfo<'a>>,
    ) -> Result<Self, ProgramError> {
        let deserialized_position_ta = if position_ta.is_some() {
            Some(DeserializedAccount::<TokenAccount>::unpack(position_ta)?.unwrap())
        } else {
            None
        };
        let deserialized_signer_ta = if signer_ta.is_some() {
            Some(DeserializedAccount::<TokenAccount>::unpack(signer_ta)?.unwrap())
        } else {
            None
        };
        Ok(Self {
            mint,
            position_ta: deserialized_position_ta,
            signer_ta: deserialized_signer_ta,
            protocol_ta,
        })
    }
}

pub trait LendingProtocolClient<'a> {
    fn validate(&self, std_accounts: &Box<SolautoStandardAccounts>) -> ProgramResult;
    fn deposit<'c>(
        &self,
        base_unit_amount: u64,
        std_accounts: &'c Box<SolautoStandardAccounts<'a>>,
    ) -> ProgramResult;
    fn borrow<'c>(
        &self,
        base_unit_amount: u64,
        destination: &'a AccountInfo<'a>,
        std_accounts: &'c Box<SolautoStandardAccounts<'a>>,
    ) -> ProgramResult;
    fn withdraw<'c>(
        &self,
        amount: TokenBalanceAmount,
        destination: &'a AccountInfo<'a>,
        std_accounts: &'c Box<SolautoStandardAccounts<'a>>,
    ) -> ProgramResult;
    fn repay<'c>(
        &self,
        amount: TokenBalanceAmount,
        std_accounts: &'c Box<SolautoStandardAccounts<'a>>,
    ) -> ProgramResult;
}
