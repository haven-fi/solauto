use solana_program::entrypoint::ProgramResult;

use crate::{
    solend::client::SolendClient,
    types::{
        instruction::{
            accounts::{ Context, SolendProtocolInteractionAccounts },
            ProtocolInteractionArgs,
        },
        shared::{ DeserializedAccount, Position },
        solauto_manager::SolautoManager,
    },
};

pub fn solend_interaction<'a>(
    mut ctx: Context<'a, SolendProtocolInteractionAccounts<'a>>,
    mut solauto_position: &mut Option<DeserializedAccount<Position>>,
    args: ProtocolInteractionArgs
) -> ProgramResult {
    let (solend_client, obligation_position) = SolendClient::from(&mut ctx)?;
    let solauto_manager = SolautoManager::from(&solend_client, &obligation_position)?;

    // TODO take action based on args

    if !ctx.accounts.solauto_position.is_none() {
        SolautoManager::refresh_position(&obligation_position, solauto_position.as_mut().unwrap())?;
    }

    Ok(())
}
