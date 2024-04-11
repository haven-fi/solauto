use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    program_error::ProgramError,
};
// use marginfi_sdk::generated::accounts::{ Bank, MarginfiAccount };

use crate::types::{
    instruction::accounts::{
        Context,
        MarginfiOpenPositionAccounts,
    },
    lending_protocol::LendingProtocolClient,
    obligation_position::LendingProtocolObligationPosition,
    shared::{ DeserializedAccount, Position },
};

pub struct MarginfiDataAccounts<'a> {
    pub temp: &'a AccountInfo<'a>, // TODO remove me
    // pub supply_bank: Option<DeserializedAccount<'a, Bank>>,
    // pub debt_bank: Option<DeserializedAccount<'a, Bank>>,
    // pub marginfi_account: DeserializedAccount<'a, MarginfiAccount>,
}

pub struct MarginfiClient<'a> {
    signer: &'a AccountInfo<'a>,
    // data_accounts: MarginfiDataAccounts<'a>,
}

impl<'a> MarginfiClient<'a> {
    pub fn initialize<'b>(
        ctx: &'b Context<'a, MarginfiOpenPositionAccounts>,
        solauto_position: &Option<DeserializedAccount<Position>>
    ) -> ProgramResult {
        // TODO
        Ok(())
    }

    pub fn from(
        signer: &'a AccountInfo<'a>
    ) -> Result<(Self, LendingProtocolObligationPosition), ProgramError> {
        let client = Self {
            signer,
        };

        let obligation_position = MarginfiClient::get_obligation_position()?;

        return Ok((client, obligation_position));
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

impl<'a> LendingProtocolClient<'a> for MarginfiClient<'a> {
    fn validate(&self) -> ProgramResult {
        // TODO
        Ok(())
    }

    fn deposit<'b>(
        &self,
        base_unit_amount: u64,
        solauto_position: &'b Option<DeserializedAccount<'a, Position>>
    ) -> ProgramResult {
        // TODO
        Ok(())
    }

    fn withdraw<'b>(
        &self,
        base_unit_amount: u64,
        solauto_position: &'b Option<DeserializedAccount<'a, Position>>
    ) -> ProgramResult {
        // TODO
        Ok(())
    }

    fn borrow<'b>(
        &self,
        base_unit_amount: u64,
        solauto_position: &'b Option<DeserializedAccount<'a, Position>>
    ) -> ProgramResult {
        // TODO
        Ok(())
    }

    fn repay<'b>(
        &self,
        base_unit_amount: u64,
        solauto_position: &'b Option<DeserializedAccount<'a, Position>>
    ) -> ProgramResult {
        // TODO
        Ok(())
    }
}
