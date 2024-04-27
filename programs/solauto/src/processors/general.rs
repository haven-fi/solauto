use std::ops::Div;

use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    instruction::{ get_stack_height, TRANSACTION_LEVEL_STACK_HEIGHT },
    msg,
    program_error::ProgramError,
    sysvar::instructions::{ load_current_index_checked, load_instruction_at_checked },
};
use spl_associated_token_account::get_associated_token_address;

use crate::{
    constants::{ JUP_PROGRAM, SOLAUTO_MANAGER, WSOL_MINT },
    instructions::referral_fees,
    types::{
        instruction::{
            accounts::{
                ClaimReferralFeesAccounts,
                ClosePositionAccounts,
                ConvertReferralFeesAccounts,
                UpdatePositionAccounts,
                UpdateReferralStatesAccounts,
            },
            UpdatePositionData,
        },
        shared::{ DeserializedAccount, PositionAccount, ReferralStateAccount, SolautoError },
    },
    utils::{ ix_utils, solana_utils, solauto_utils, validation_utils },
};

pub fn process_update_referral_states<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    let ctx = UpdateReferralStatesAccounts::context(accounts)?;

    if !ctx.accounts.signer.is_signer {
        return Err(ProgramError::MissingRequiredSignature.into());
    }

    let authority_referral_state = solauto_utils::get_or_create_referral_state(
        ctx.accounts.system_program,
        ctx.accounts.token_program,
        ctx.accounts.rent,
        ctx.accounts.signer,
        ctx.accounts.signer,
        ctx.accounts.dest_referral_fees_mint,
        ctx.accounts.signer_referral_state,
        ctx.accounts.signer_referral_dest_ta,
        ctx.accounts.referred_by_state,
        ctx.accounts.referred_by_dest_ta
    )?;

    if ctx.accounts.referred_by_state.is_some() {
        solauto_utils::get_or_create_referral_state(
            ctx.accounts.system_program,
            ctx.accounts.token_program,
            ctx.accounts.rent,
            ctx.accounts.signer,
            ctx.accounts.referred_by_authority.unwrap(),
            ctx.accounts.dest_referral_fees_mint,
            ctx.accounts.referred_by_state.unwrap(),
            ctx.accounts.referred_by_dest_ta.unwrap(),
            None,
            None
        )?;
    }

    // TODO for solauto manager:
    // solauto manager must have a idempotent create token account instruction (only under condition of a first time rebalance for every unique referred_by_state and supply token  

    validation_utils::validate_referral_accounts(
        &ctx.accounts.signer.key,
        &Some(authority_referral_state),
        ctx.accounts.referred_by_state,
        None,
    )?;

    Ok(())
}

pub fn process_convert_referral_fees<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    let ctx = ConvertReferralFeesAccounts::context(accounts)?;
    let referral_state = DeserializedAccount::<ReferralStateAccount>
        ::deserialize(Some(ctx.accounts.referral_state))?
        .unwrap();

    if !ctx.accounts.solauto_manager.is_signer {
        return Err(ProgramError::MissingRequiredSignature.into());
    }

    if ctx.accounts.solauto_manager.key != &SOLAUTO_MANAGER {
        msg!("Instruction can only be invoked by the Solauto manager");
        return Err(ProgramError::InvalidAccountData.into());
    }

    let current_ix_idx = load_current_index_checked(ctx.accounts.ixs_sysvar)?;
    let current_ix = load_instruction_at_checked(current_ix_idx as usize, ctx.accounts.ixs_sysvar)?;
    if current_ix.program_id != crate::ID || get_stack_height() > TRANSACTION_LEVEL_STACK_HEIGHT {
        return Err(SolautoError::InstructionIsCPI.into());
    }

    let mut index = current_ix_idx;
    loop {
        if let Err(_) = load_instruction_at_checked(index as usize, ctx.accounts.ixs_sysvar) {
            break;
        }
        index += 1;
    }

    let jup_swap = solauto_utils::InstructionChecker::from_anchor(
        JUP_PROGRAM,
        "jupiter",
        vec!["route_with_token_ledger", "shared_accounts_route_with_token_ledger"]
    );

    let next_ix = solauto_utils::get_relative_instruction(
        ctx.accounts.ixs_sysvar,
        current_ix_idx,
        1,
        index
    )?;

    if !jup_swap.matches(&next_ix) {
        msg!("Missing Jup swap as next transaction");
        return Err(SolautoError::IncorrectInstructions.into());
    }

    referral_fees::convert_referral_fees(ctx, referral_state)
}

pub fn process_claim_referral_fees<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    let ctx = ClaimReferralFeesAccounts::context(accounts)?;
    let referral_state = DeserializedAccount::<ReferralStateAccount>
        ::deserialize(Some(ctx.accounts.referral_state))?
        .unwrap();

    if !ctx.accounts.signer.is_signer {
        return Err(ProgramError::MissingRequiredSignature.into());
    }

    if ctx.accounts.signer.key != &referral_state.data.authority {
        msg!("Incorrect referral state provided for the given signer");
        return Err(ProgramError::InvalidAccountData.into());
    }

    if ctx.accounts.referral_fees_mint.key != &WSOL_MINT {
        if ctx.accounts.dest_ta.is_none() {
            msg!("Missing destination token account when the token mint is not wSOL");
            return Err(ProgramError::InvalidAccountData.into());
        }
        if
            ctx.accounts.dest_ta.unwrap().key !=
            &get_associated_token_address(
                ctx.accounts.signer.key,
                ctx.accounts.referral_fees_mint.key
            )
        {
            msg!(
                "Provided incorrect destination token account for the given signer and token mint"
            );
            return Err(ProgramError::InvalidAccountData.into());
        }
    }

    referral_fees::claim_referral_fees(ctx)
}

pub fn process_update_position_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    new_data: UpdatePositionData
) -> ProgramResult {
    let ctx = UpdatePositionAccounts::context(accounts)?;
    let mut solauto_position = DeserializedAccount::<PositionAccount>
        ::deserialize(Some(ctx.accounts.solauto_position))?
        .unwrap();

    validation_utils::validate_signer(ctx.accounts.signer, &solauto_position, true)?;
    if solauto_position.data.self_managed {
        msg!("Cannot provide setting parameters to a self-managed position");
        return Err(ProgramError::InvalidAccountData.into());
    }

    let position_data = solauto_position.data.position.as_mut().unwrap();
    if new_data.setting_params.is_some() {
        validation_utils::validate_position_settings(
            new_data.setting_params.as_ref().unwrap(),
            (position_data.state.max_ltv_bps as f64).div(10000.0),
            (position_data.state.liq_threshold as f64).div(10000.0)
        )?;
        position_data.setting_params = new_data.setting_params.as_ref().unwrap().clone();
    }

    if new_data.active_dca.is_some() {
        validation_utils::validate_dca_settings(&new_data.active_dca)?;
        position_data.active_dca = new_data.active_dca.clone();
        solauto_utils::initiate_dca_in_if_necessary(
            ctx.accounts.token_program,
            &mut solauto_position,
            ctx.accounts.position_debt_ta,
            ctx.accounts.signer,
            ctx.accounts.signer_debt_ta
        )?;
    }

    ix_utils::update_data(&mut solauto_position)
}

pub fn process_close_position_instruction<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    let ctx = ClosePositionAccounts::context(accounts)?;
    let solauto_position = DeserializedAccount::<PositionAccount>
        ::deserialize(Some(ctx.accounts.solauto_position))?
        .unwrap();

    validation_utils::validate_signer(ctx.accounts.signer, &solauto_position, true)?;
    if solauto_position.data.self_managed {
        msg!("Cannot close a self-managed position");
        return Err(ProgramError::InvalidAccountData.into());
    }

    solana_utils::close_token_account(
        ctx.accounts.token_program,
        ctx.accounts.position_supply_liquidity_ta,
        ctx.accounts.signer,
        ctx.accounts.solauto_position
    )?;

    solana_utils::close_token_account(
        ctx.accounts.token_program,
        ctx.accounts.position_debt_liquidity_ta,
        ctx.accounts.signer,
        ctx.accounts.solauto_position
    )?;

    if ctx.accounts.position_supply_collateral_ta.is_some() {
        solana_utils::close_token_account(
            ctx.accounts.token_program,
            ctx.accounts.position_supply_collateral_ta.unwrap(),
            ctx.accounts.signer,
            ctx.accounts.solauto_position
        )?;
    }

    solana_utils::close_pda(
        ctx.accounts.solauto_position,
        ctx.accounts.signer,
        vec![&[solauto_position.data.position_id], ctx.accounts.signer.key.as_ref()]
    )?;

    Ok(())
}
