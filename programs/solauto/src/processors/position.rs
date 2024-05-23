use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, msg, sysvar::Sysvar,
};
use spl_token::state::Account as TokenAccount;

use crate::{
    instructions::{close_position, update_position},
    types::{
        instruction::{
            accounts::{CancelDCAAccounts, ClosePositionAccounts, UpdatePositionAccounts},
            UpdatePositionData,
        },
        shared::{DeserializedAccount, SolautoError, SolautoPosition},
    },
    utils::{ix_utils, solauto_utils, validation_utils},
};

pub fn process_update_position_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    new_data: UpdatePositionData,
) -> ProgramResult {
    let ctx = UpdatePositionAccounts::context(accounts)?;
    let solauto_position =
        DeserializedAccount::<SolautoPosition>::deserialize(Some(ctx.accounts.solauto_position))?
            .unwrap();

    validation_utils::validate_instruction(ctx.accounts.signer, &solauto_position, true, true)?;

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

    update_position::update_position(ctx, solauto_position, new_data)
}

pub fn process_close_position_instruction<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    let ctx = ClosePositionAccounts::context(accounts)?;
    let solauto_position =
        DeserializedAccount::<SolautoPosition>::deserialize(Some(ctx.accounts.solauto_position))?
            .unwrap();
    let position_supply_liquidity_ta = DeserializedAccount::<TokenAccount>::unpack(Some(
        ctx.accounts.position_supply_liquidity_ta,
    ))?
    .unwrap();
    let position_debt_liquidity_ta =
        DeserializedAccount::<TokenAccount>::unpack(Some(ctx.accounts.position_debt_liquidity_ta))?;

    validation_utils::validate_instruction(ctx.accounts.signer, &solauto_position, true, true)?;

    validation_utils::validate_token_accounts(
        ctx.accounts.signer,
        &solauto_position,
        Some(&position_supply_liquidity_ta),
        position_debt_liquidity_ta.as_ref(),
    )?;

    close_position::close_position(
        ctx,
        solauto_position,
        position_supply_liquidity_ta,
        position_debt_liquidity_ta,
    )
}

pub fn process_cancel_dca<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    let ctx = CancelDCAAccounts::context(accounts)?;
    let mut solauto_position =
        DeserializedAccount::<SolautoPosition>::deserialize(Some(ctx.accounts.solauto_position))?
            .unwrap();

    validation_utils::validate_instruction(ctx.accounts.signer, &solauto_position, true, true)?;

    if solauto_position
        .data
        .position
        .as_ref()
        .unwrap()
        .active_dca
        .is_none()
    {
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
        solauto_position.data.position.as_ref().unwrap(),
        Clock::get()?.unix_timestamp as u64,
    )?;

    ix_utils::update_data(&mut solauto_position)
}
