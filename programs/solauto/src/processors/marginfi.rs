use solana_program::{ account_info::AccountInfo, entrypoint::ProgramResult };

use crate::{
    types::{
        instruction::{ accounts::MarginfiOpenPositionAccounts, OpenPositionArgs },
        shared::LendingPlatform,
    },
    utils::*,
};

pub fn process_marginfi_open_position_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    args: OpenPositionArgs
) -> ProgramResult {
    let ctx = MarginfiOpenPositionAccounts::context(accounts)?;
    let mut solauto_position = ix_utils::create_new_solauto_position(
        ctx.accounts.signer,
        ctx.accounts.solauto_position,
        args.position_data,
        LendingPlatform::Marginfi
    )?;
    validation_utils::validate_signer(ctx.accounts.signer, &solauto_position, true)?;
    validation_utils::validate_program_account(
        &ctx.accounts.marginfi_program,
        LendingPlatform::Marginfi
    )?;
    // TODO: open position instruction
    ix_utils::update_data(&mut solauto_position)
}
