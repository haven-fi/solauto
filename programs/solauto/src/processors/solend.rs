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
        shared::{
            DeserializedAccount,
            GeneralPositionData,
            LendingPlatform,
            Position,
            PositionsManager,
        },
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
    // TODO: add position pubkey to positions manager account
    validation_utils::validate_signer(ctx.accounts.signer, &solauto_position, true)?;
    validation_utils::validate_solend_accounts(&ctx.accounts.solend_program)?;
    
    if !solauto_position.is_none() {
        let mut positions_manager = DeserializedAccount::<PositionsManager>::deserialize(
            ctx.accounts.positions_manager
        )?;
        // TODO: create account if needed (allocate minimum space required)
        // TODO: allocate more space if needed
        ix_utils::update_data(&mut positions_manager)?;
    }
    
    solend_open_position::solend_open_position(ctx, &mut solauto_position)?;
    ix_utils::update_data(&mut solauto_position)
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
    ix_utils::update_data(&mut solauto_position)
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
    validation_utils::validate_solend_protocol_interaction_accounts(&ctx, &args)?;
    protocol_interaction::solend_interaction(ctx, &mut solauto_position, args)?;
    ix_utils::update_data(&mut solauto_position)
}

pub fn process_solend_rebalance_ping() -> ProgramResult {
    // TODO
    // TODO if current utilization rate is above 100%, ensure we have enough debt liquidity in our source token account to repay. If not, throw an error mentioning we need to perform a flash loan
    Ok(())
}
