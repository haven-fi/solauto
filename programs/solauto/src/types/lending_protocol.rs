use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
};
use spl_token::state::Account as TokenAccount;

use super::{
    instruction::SolautoStandardAccounts,
    obligation_position::LendingProtocolObligationPosition,
    shared::{DeserializedAccount, TokenBalanceAmount},
};

pub struct LendingProtocolTokenAccounts<'a> {
    pub mint: Option<&'a AccountInfo<'a>>,
    pub source_ta: DeserializedAccount<'a, TokenAccount>,
    pub protocol_ta: &'a AccountInfo<'a>,
}

impl<'a> LendingProtocolTokenAccounts<'a> {
    pub fn from(
        mint: Option<&'a AccountInfo<'a>>,
        source_ta: Option<&'a AccountInfo<'a>>,
        protocol_ta: Option<&'a AccountInfo<'a>>,
    ) -> Result<Option<Self>, ProgramError> {
        if source_ta.is_some() && protocol_ta.is_some() {
            Ok(Some(Self {
                mint,
                source_ta: DeserializedAccount::<TokenAccount>::unpack(source_ta)?.unwrap(),
                protocol_ta: protocol_ta.unwrap(),
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
        amount: TokenBalanceAmount,
        destination: &'a AccountInfo<'a>,
        std_accounts: &'b SolautoStandardAccounts<'a>,
        obligation_position: &LendingProtocolObligationPosition,
    ) -> ProgramResult;
    fn repay<'b>(
        &self,
        amount: TokenBalanceAmount,
        std_accounts: &'b SolautoStandardAccounts<'a>,
        obligation_position: &LendingProtocolObligationPosition,
    ) -> ProgramResult;
}
