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
            PositionData,
            ProtocolInteractionArgs,
        },
        shared::{ DeserializedAccount, LendingPlatform, Position },
    },
    utils::*,
};

pub fn process_solend_open_position_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    position_data: Option<PositionData>
) -> ProgramResult {
    let ctx = SolendOpenPositionAccounts::context(accounts)?;
    let mut solauto_position = solauto_utils::create_new_solauto_position(
        ctx.accounts.signer,
        ctx.accounts.solauto_position,
        position_data,
        LendingPlatform::Solend
    )?;
    validation_utils::validate_signer(ctx.accounts.signer, &solauto_position, true)?;
    validation_utils::validate_program_account(&ctx.accounts.solend_program, LendingPlatform::Solend)?;
    open_position::solend_open_position(ctx, &mut solauto_position)?;
    ix_utils::update_data(&mut solauto_position)
}

pub fn process_solend_refresh_accounts<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    let ctx = SolendRefreshDataAccounts::context(accounts)?;
    let mut solauto_position = DeserializedAccount::<Position>::deserialize(
        ctx.accounts.solauto_position
    )?;
    validation_utils::validate_program_account(&ctx.accounts.solend_program, LendingPlatform::Solend)?;
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
    validation_utils::validate_program_account(ctx.accounts.solend_program, LendingPlatform::Solend)?;
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
