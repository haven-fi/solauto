use solana_program::entrypoint::ProgramResult;

use crate::{
    clients::{ solend::SolendClient, marginfi::MarginfiClient },
    types::{
        instruction::accounts::{
            Context,
            MarginfiProtocolInteractionAccounts,
            SolendProtocolInteractionAccounts,
        },
        shared::{ DeserializedAccount, Position, SolautoAction },
        solauto_manager::SolautoManager,
    },
};

pub fn marginfi_interaction<'a>(
    mut ctx: Context<'a, MarginfiProtocolInteractionAccounts<'a>>,
    solauto_position: &mut Option<DeserializedAccount<'a, Position>>,
    action: SolautoAction
) -> ProgramResult {
    let (marginfi_client, mut obligation_position) = MarginfiClient::from(
        &mut ctx,
        solauto_position
    )?;

    let mut solauto_manager = SolautoManager::from(&marginfi_client, &mut obligation_position)?;

    solauto_manager.protocol_interaction(action)?;

    if !ctx.accounts.solauto_position.is_none() {
        SolautoManager::refresh_position(&obligation_position, solauto_position.as_mut().unwrap())?;
    }

    Ok(())
}

pub fn solend_interaction<'a>(
    mut ctx: Context<'a, SolendProtocolInteractionAccounts<'a>>,
    solauto_position: &mut Option<DeserializedAccount<'a, Position>>,
    action: SolautoAction
) -> ProgramResult {
    let (solend_client, mut obligation_position) = SolendClient::from(&mut ctx, solauto_position)?;
    
    let mut solauto_manager = SolautoManager::from(&solend_client, &mut obligation_position)?;

    solauto_manager.protocol_interaction(action)?;

    if !ctx.accounts.solauto_position.is_none() {
        SolautoManager::refresh_position(&obligation_position, solauto_position.as_mut().unwrap())?;
    }

    Ok(())
}
