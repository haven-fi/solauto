use solana_program::{ account_info::AccountInfo, entrypoint::ProgramResult };

use crate::{
    instructions::*,
    types::{
        instruction::{
            accounts::{
                SolendOpenPositionAccounts,
                SolendProtocolInteractionAccounts,
                SolendRefreshDataAccounts,
            },
            OpenPositionArgs,
            ProtocolInteractionArgs,
        },
        shared::{ DeserializedAccount, GeneralPositionData, LendingPlatform, Position },
    },
    utils::*,
};

pub fn process_solend_open_position_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    args: OpenPositionArgs
) -> ProgramResult {
    let ctx = SolendOpenPositionAccounts::context(accounts)?;
    let position_data = if !args.position_data.is_none() {
        let data = args.position_data.as_ref().unwrap();
        validation_utils::validate_position_settings(&data.setting_params)?;
        Some(Position {
            position_id: data.position_id,
            authority: *ctx.accounts.signer.key,
            lending_platform: LendingPlatform::Solend,
            setting_params: data.setting_params.clone(),
            general_data: GeneralPositionData::default(),
            solend_data: data.solend_data.clone(),
            _padding: [0; 136],
        })
    } else {
        None
    };
    let mut solauto_position = if !position_data.is_none() {
        Some(DeserializedAccount::<Position> {
            account_info: ctx.accounts.solauto_position.unwrap(),
            data: Box::new(position_data.unwrap()),
        })
    } else {
        None
    };
    validation_utils::validate_signer(ctx.accounts.signer, &solauto_position, true)?;
    validation_utils::validate_solend_accounts(&ctx.accounts.solend_program)?;
    solend_open_position::solend_open_position(ctx, &mut solauto_position)?;
    ix_utils::update_position(&mut solauto_position)
}

pub fn process_solend_update_position_instruction() -> ProgramResult {
    // TODO
    Ok(())
}

pub fn process_solend_refresh_accounts<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    let ctx = SolendRefreshDataAccounts::context(accounts)?;
    validation_utils::validate_solend_accounts(&ctx.accounts.solend_program)?;
    let mut solauto_position = DeserializedAccount::<Position>::deserialize(
        ctx.accounts.solauto_position
    )?;
    refresh::solend_refresh_accounts(ctx, &mut solauto_position)?;
    ix_utils::update_position(&mut solauto_position)
}

pub fn process_solend_interaction_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    args: ProtocolInteractionArgs
) -> ProgramResult {
    let ctx = SolendProtocolInteractionAccounts::context(accounts)?;
    let mut solauto_position = DeserializedAccount::<Position>::deserialize(
        ctx.accounts.solauto_position
    )?;
    validation_utils::validate_signer(ctx.accounts.signer, &solauto_position, true)?;
    validation_utils::validate_solend_accounts(ctx.accounts.solend_program)?;
    validation_utils::validate_fee_receiver(ctx.accounts.solauto_fee_receiver)?;
    protocol_interaction::solend_interaction(ctx, &mut solauto_position, args)?;
    ix_utils::update_position(&mut solauto_position)
}

pub fn process_solend_rebalance_ping() -> ProgramResult {
    // TODO
    Ok(())
}
