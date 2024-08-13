use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, msg, sysvar::Sysvar,
};
use spl_token::state::Account as TokenAccount;

use crate::{
    instructions::{close_position, update_position},
    state::solauto_position::SolautoPosition,
    types::{
        instruction::{
            accounts::{CancelDCAAccounts, ClosePositionAccounts, UpdatePositionAccounts},
            UpdatePositionData,
        },
        shared::{DeserializedAccount, SolautoError},
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
    validation_utils::validate_sysvar_accounts(
        Some(ctx.accounts.system_program),
        Some(ctx.accounts.token_program),
        None,
        None,
        None,
    )?;

    if ctx.accounts.position_debt_ta.is_some() {
        validation_utils::validate_token_account(
            ctx.accounts.signer,
            &solauto_position,
            DeserializedAccount::<TokenAccount>::unpack(ctx.accounts.position_debt_ta)?.as_ref(),
            None,
            Some(ctx.accounts.debt_mint.unwrap().key),
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

    let position_supply_ta =
        DeserializedAccount::<TokenAccount>::unpack(Some(ctx.accounts.position_supply_ta))?
            .unwrap();
    let position_debt_ta =
        DeserializedAccount::<TokenAccount>::unpack(Some(ctx.accounts.position_debt_ta))?;

    validation_utils::validate_instruction(ctx.accounts.signer, &solauto_position, true, true)?;
    validation_utils::validate_sysvar_accounts(
        Some(ctx.accounts.system_program),
        Some(ctx.accounts.token_program),
        Some(ctx.accounts.ata_program),
        None,
        None,
    )?;

    validation_utils::validate_token_accounts(
        ctx.accounts.signer,
        &solauto_position,
        Some(&position_supply_ta),
        position_debt_ta.as_ref(),
    )?;

    close_position::close_position(ctx, solauto_position, position_supply_ta, position_debt_ta)
}

pub fn process_cancel_dca<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    msg!("Instruction: Cancel DCA");
    let ctx = CancelDCAAccounts::context(accounts)?;
    let mut solauto_position =
        DeserializedAccount::<SolautoPosition>::zerocopy(Some(ctx.accounts.solauto_position))?
            .unwrap();

    validation_utils::validate_instruction(ctx.accounts.signer, &solauto_position, true, true)?;
    validation_utils::validate_sysvar_accounts(
        Some(ctx.accounts.system_program),
        Some(ctx.accounts.token_program),
        Some(ctx.accounts.ata_program),
        None,
        None,
    )?;

    if !solauto_position.data.position.dca.is_active() {
        msg!("No active DCA exists on the provided Solauto position");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    let debt_mint_pubkey = ctx
        .accounts
        .debt_mint
        .map_or_else(|| None, |mint| Some(mint.key));
    validation_utils::validate_token_account(
        ctx.accounts.signer,
        &solauto_position,
        DeserializedAccount::<TokenAccount>::unpack(ctx.accounts.position_debt_ta)?.as_ref(),
        None,
        debt_mint_pubkey,
    )?;

    solauto_utils::cancel_dca_in_if_necessary(
        ctx.accounts.signer,
        ctx.accounts.system_program,
        ctx.accounts.token_program,
        &mut solauto_position,
        ctx.accounts.debt_mint,
        ctx.accounts.position_debt_ta,
        ctx.accounts.signer_debt_ta,
    )?;

    validation_utils::validate_position_settings(
        &solauto_position.data,
        Clock::get()?.unix_timestamp as u64,
    )?;

    ix_utils::update_data(&mut solauto_position)
}
