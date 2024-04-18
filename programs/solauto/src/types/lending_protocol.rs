use solana_program::{ account_info::AccountInfo, entrypoint::ProgramResult };

use super::instruction::SolautoStandardAccounts;

pub struct LendingProtocolTokenAccounts<'a> {
    pub mint: &'a AccountInfo<'a>,
    pub position_ta: &'a AccountInfo<'a>,
    pub reserve_ta: &'a AccountInfo<'a>,
}

impl<'a> LendingProtocolTokenAccounts<'a> {
    pub fn from(
        mint: Option<&'a AccountInfo<'a>>,
        position_ta: Option<&'a AccountInfo<'a>>,
        reserve_ta: Option<&'a AccountInfo<'a>>
    ) -> Option<Self> {
        if
            !mint.is_none() &&
            !position_ta.is_none() &&
            !reserve_ta.is_none()
        {
            Some(Self {
                mint: mint.unwrap(),
                position_ta: position_ta.unwrap(),
                reserve_ta: reserve_ta.unwrap(),
            })
        } else {
            None
        }
    }
}

pub trait LendingProtocolClient<'a> {
    fn validate(&self, std_accounts: &SolautoStandardAccounts) -> ProgramResult;
    fn deposit<'b>(
        &self,
        base_unit_amount: u64,
        std_accounts: &'b SolautoStandardAccounts<'a>
    ) -> ProgramResult;
    fn borrow<'b>(
        &self,
        base_unit_amount: u64,
        destination: &'a AccountInfo<'a>,
        std_accounts: &'b SolautoStandardAccounts<'a>
    ) -> ProgramResult;
    fn withdraw<'b>(
        &self,
        base_unit_amount: u64,
        destination: &'a AccountInfo<'a>,
        std_accounts: &'b SolautoStandardAccounts<'a>
    ) -> ProgramResult;
    fn repay<'b>(
        &self,
        base_unit_amount: u64,
        std_accounts: &'b SolautoStandardAccounts<'a>
    ) -> ProgramResult;
}
