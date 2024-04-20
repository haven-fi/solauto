use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError};
use spl_token::state::Account as TokenAccount;

use super::{instruction::SolautoStandardAccounts, shared::DeserializedAccount};

pub struct LendingProtocolTokenAccounts<'a> {
    pub mint: &'a AccountInfo<'a>,
    pub source_ta: DeserializedAccount<'a, TokenAccount>,
    pub reserve_ta: &'a AccountInfo<'a>,
}

impl<'a> LendingProtocolTokenAccounts<'a> {
    pub fn from(
        mint: Option<&'a AccountInfo<'a>>,
        source_ta: Option<&'a AccountInfo<'a>>,
        reserve_ta: Option<&'a AccountInfo<'a>>,
    ) -> Result<Option<Self>, ProgramError> {
        if !mint.is_none() && !source_ta.is_none() && !reserve_ta.is_none() {
            Ok(Some(Self {
                mint: mint.unwrap(),
                source_ta: DeserializedAccount::<TokenAccount>::unpack(source_ta)?.unwrap(),
                reserve_ta: reserve_ta.unwrap(),
            }))
        } else {
            Ok(None)
        }
    }
}

pub trait LendingProtocolClient<'a> {
    fn validate(&self, std_accounts: &SolautoStandardAccounts) -> ProgramResult;
    fn deposit<'b>(
        &self,
        base_unit_amount: u64,
        std_accounts: &'b SolautoStandardAccounts<'a>,
    ) -> ProgramResult;
    fn borrow<'b>(
        &self,
        base_unit_amount: u64,
        destination: &'a AccountInfo<'a>,
        std_accounts: &'b SolautoStandardAccounts<'a>,
    ) -> ProgramResult;
    fn withdraw<'b>(
        &self,
        base_unit_amount: u64,
        destination: &'a AccountInfo<'a>,
        std_accounts: &'b SolautoStandardAccounts<'a>,
    ) -> ProgramResult;
    fn repay<'b>(
        &self,
        base_unit_amount: u64,
        std_accounts: &'b SolautoStandardAccounts<'a>,
    ) -> ProgramResult;
}
