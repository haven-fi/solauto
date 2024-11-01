use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
};

use super::{instruction::SolautoStandardAccounts, shared::TokenBalanceAmount};

#[derive(Clone)]
pub struct LendingProtocolTokenAccounts<'a> {
    pub mint: Option<&'a AccountInfo<'a>>,
    pub position_ta: Option<&'a AccountInfo<'a>>,
    pub authority_ta: Option<&'a AccountInfo<'a>>,
    pub protocol_ta: Option<&'a AccountInfo<'a>>,
}

impl<'a> LendingProtocolTokenAccounts<'a> {
    pub fn from(
        mint: Option<&'a AccountInfo<'a>>,
        position_ta: Option<&'a AccountInfo<'a>>,
        authority_ta: Option<&'a AccountInfo<'a>>,
        protocol_ta: Option<&'a AccountInfo<'a>>,
    ) -> Result<Self, ProgramError> {
        Ok(Self {
            mint,
            position_ta,
            authority_ta,
            protocol_ta,
        })
    }
}

pub trait LendingProtocolClient<'a> {
    fn validate(&self, std_accounts: &Box<SolautoStandardAccounts<'a>>) -> ProgramResult;
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
