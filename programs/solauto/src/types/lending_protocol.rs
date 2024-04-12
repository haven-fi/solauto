use solana_program::{ account_info::AccountInfo, entrypoint::ProgramResult };

use super::instruction::SolautoStandardAccounts;

pub struct LendingProtocolTokenAccounts<'a> {
    pub token_mint: &'a AccountInfo<'a>,
    pub source_token_account: &'a AccountInfo<'a>,
    pub reserve_token_account: &'a AccountInfo<'a>,
}

impl<'a> LendingProtocolTokenAccounts<'a> {
    pub fn from(
        token_mint: Option<&'a AccountInfo<'a>>,
        source_token_account: Option<&'a AccountInfo<'a>>,
        reserve_token_account: Option<&'a AccountInfo<'a>>
    ) -> Option<Self> {
        if
            !token_mint.is_none() &&
            !source_token_account.is_none() &&
            !reserve_token_account.is_none()
        {
            Some(Self {
                token_mint: token_mint.unwrap(),
                source_token_account: source_token_account.unwrap(),
                reserve_token_account: reserve_token_account.unwrap(),
            })
        } else {
            None
        }
    }
}

pub trait LendingProtocolClient<'a> {
    fn validate(&self) -> ProgramResult;
    fn deposit<'b>(
        &self,
        base_unit_amount: u64,
        accounts: &'b SolautoStandardAccounts<'a>
    ) -> ProgramResult;
    fn borrow<'b>(
        &self,
        base_unit_amount: u64,
        accounts: &'b SolautoStandardAccounts<'a>
    ) -> ProgramResult;
    fn withdraw<'b>(
        &self,
        base_unit_amount: u64,
        accounts: &'b SolautoStandardAccounts<'a>
    ) -> ProgramResult;
    fn repay<'b>(
        &self,
        base_unit_amount: u64,
        accounts: &'b SolautoStandardAccounts<'a>
    ) -> ProgramResult;
}
