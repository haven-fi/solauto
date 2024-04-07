use solana_program::{ account_info::AccountInfo, entrypoint::ProgramResult };

use crate::types::{
    instruction::accounts::{ Context, MarginfiOpenPositionAccounts },
    shared::{ DeserializedAccount, Position },
};

pub struct MarginfiClient<'a> {
    signer: &'a AccountInfo<'a>,
}

impl<'a> MarginfiClient<'a> {
    pub fn initialize<'b>(
        ctx: &'b Context<'a, MarginfiOpenPositionAccounts>,
        solauto_position: &Option<DeserializedAccount<Position>>
    ) -> ProgramResult {
        // TODO
        Ok(())
    }
}
