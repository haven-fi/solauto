use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult, msg};

use crate::{
    check,
    instructions::{close_position, update_position},
    state::solauto_position::SolautoPosition,
    types::{
        errors::SolautoError,
        instruction::{
            accounts::{CancelDCAAccounts, ClosePositionAccounts, UpdatePositionAccounts},
            UpdatePositionData,
        },
        shared::DeserializedAccount,
    },
    utils::{ix_utils, solauto_utils, validation_utils},
};

pub fn process_update_position_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    args: UpdatePositionData,
) -> ProgramResult {
    msg!("Instruction: Update position");
    let ctx = UpdatePositionAccounts::context(accounts)?;
    let solauto_position =
        DeserializedAccount::<SolautoPosition>::zerocopy(Some(ctx.accounts.solauto_position))?
            .unwrap();

    validation_utils::validate_instruction(ctx.accounts.signer, &solauto_position, true, true)?;
    validation_utils::validate_standard_programs(
        Some(ctx.accounts.system_program),
        Some(ctx.accounts.token_program),
        None,
        None,
        None,
    )?;

    if args.dca.is_some() {
        validation_utils::validate_token_account(
            &solauto_position,
            ctx.accounts.position_dca_ta,
            Some(args.dca.as_ref().unwrap().token_type),
            None,
        )?;
    }

    update_position::update_position(ctx, solauto_position, args)
}

pub fn process_close_position_instruction<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    msg!("Instruction: Close position");
    let ctx = ClosePositionAccounts::context(accounts)?;
    let solauto_position =
        DeserializedAccount::<SolautoPosition>::zerocopy(Some(ctx.accounts.solauto_position))?
            .unwrap();

    validation_utils::validate_instruction(ctx.accounts.signer, &solauto_position, true, true)?;
    validation_utils::validate_standard_programs(
        Some(ctx.accounts.system_program),
        Some(ctx.accounts.token_program),
        Some(ctx.accounts.ata_program),
        None,
        None,
    )?;

    validation_utils::validate_token_accounts(
        &solauto_position,
        Some(ctx.accounts.position_supply_ta),
        Some(ctx.accounts.position_debt_ta),
    )?;

    validation_utils::validate_token_accounts(
        &solauto_position,
        Some(ctx.accounts.signer_supply_ta),
        Some(ctx.accounts.signer_debt_ta),
    )?;

    if !cfg!(feature = "local") {
        validation_utils::validate_no_active_balances(
            ctx.accounts.lp_user_account,
            solauto_position.data.position.lending_platform,
        )?;
    }

    close_position::close_position(&ctx, &solauto_position)
}

pub fn process_cancel_dca<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    msg!("Instruction: Cancel DCA");
    let ctx = CancelDCAAccounts::context(accounts)?;
    let mut solauto_position =
        DeserializedAccount::<SolautoPosition>::zerocopy(Some(ctx.accounts.solauto_position))?
            .unwrap();

    validation_utils::validate_instruction(ctx.accounts.signer, &solauto_position, true, true)?;
    validation_utils::validate_standard_programs(
        Some(ctx.accounts.system_program),
        Some(ctx.accounts.token_program),
        Some(ctx.accounts.ata_program),
        None,
        None,
    )?;

    check!(
        solauto_position.data.position.dca.is_active(),
        SolautoError::IncorrectInstructions
    );

    validation_utils::validate_token_account(
        &solauto_position,
        ctx.accounts.position_dca_ta,
        Some(solauto_position.data.position.dca.token_type),
        None,
    )?;

    solauto_utils::cancel_dca_in(
        ctx.accounts.signer,
        ctx.accounts.system_program,
        ctx.accounts.token_program,
        &mut solauto_position,
        ctx.accounts.dca_mint,
        ctx.accounts.position_dca_ta,
        ctx.accounts.signer_dca_ta,
    )?;

    validation_utils::validate_position_settings(&solauto_position.data)?;

    ix_utils::update_data(&mut solauto_position)
}
