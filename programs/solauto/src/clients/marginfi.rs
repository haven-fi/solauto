use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    program_error::ProgramError,
};
// use marginfi_sdk::generated::accounts::{ Bank, MarginfiAccount };

use crate::types::{
    instruction::accounts::{ Context, MarginfiOpenPositionAccounts },
    lending_protocol::LendingProtocolClient,
    obligation_position::LendingProtocolObligationPosition,
    shared::{ DeserializedAccount, Position },
};

pub struct MarginfiDataAccounts<'a> {
    // TODO: remove me
    pub temp: &'a AccountInfo<'a>,
    // pub supply_bank: Option<DeserializedAccount<'a, Bank>>,
    // pub debt_bank: Option<DeserializedAccount<'a, Bank>>,
    // pub marginfi_account: DeserializedAccount<'a, MarginfiAccount>,
}

pub struct MarginfiClient<'a> {
    signer: &'a AccountInfo<'a>,
    data_accounts: MarginfiDataAccounts<'a>,
}

impl<'a> MarginfiClient<'a> {
    pub fn initialize<'b>(
        ctx: &'b Context<'a, MarginfiOpenPositionAccounts>,
        solauto_position: &Option<DeserializedAccount<Position>>
    ) -> ProgramResult {
        // TODO
        Ok(())
    }

    pub fn from<'b>() -> Result<(Self, LendingProtocolObligationPosition), ProgramError> {
        // TODO
        return Err(ProgramError::Custom(0));
    }

    pub fn deserialize_margfinfi_accounts(
        supply_bank: Option<&'a AccountInfo<'a>>,
        debt_bank: Option<&'a AccountInfo<'a>>,
        marginfi_account: &'a AccountInfo<'a>
    ) -> Result<MarginfiDataAccounts<'a>, ProgramError> {
        // TODO
        return Err(ProgramError::Custom(0));
    }

    pub fn get_obligation_position() -> Result<LendingProtocolObligationPosition, ProgramError> {
        // TODO
        return Err(ProgramError::Custom(0));
    }
}

impl<'a> LendingProtocolClient for MarginfiClient<'a> {
    fn validate(&self) -> ProgramResult {
        // TODO
        Ok(())
    }

    fn deposit(&self, base_unit_amount: u64) -> ProgramResult {
        // TODO
        Ok(())
    }

    fn withdraw(&self, base_unit_amount: u64) -> ProgramResult {
        // TODO
        Ok(())
    }

    fn borrow(&self, base_unit_amount: u64) -> ProgramResult {
        // TODO
        Ok(())
    }

    fn repay(&self, base_unit_amount: u64) -> ProgramResult {
        // TODO
        Ok(())
    }
}
