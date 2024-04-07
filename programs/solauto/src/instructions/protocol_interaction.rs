use solana_program::entrypoint::ProgramResult;

use crate::{
    clients::solend::SolendClient,
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
    solauto_position: &mut Option<DeserializedAccount<Position>>,
    args: ProtocolInteractionArgs
) -> ProgramResult {
    let (solend_client, mut obligation_position) = SolendClient::from(&mut ctx)?;
    let mut solauto_manager = SolautoManager::from(&solend_client, &mut obligation_position)?;

    solauto_manager.protocol_interaction(args)?;

    if !ctx.accounts.solauto_position.is_none() {
        SolautoManager::refresh_position(&obligation_position, solauto_position.as_mut().unwrap())?;
    }

    Ok(())
}
