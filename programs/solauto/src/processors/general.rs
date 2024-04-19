use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    instruction::{get_stack_height, TRANSACTION_LEVEL_STACK_HEIGHT},
    msg,
    program_error::ProgramError,
    sysvar::instructions::{load_current_index_checked, load_instruction_at_checked},
};
use spl_associated_token_account::get_associated_token_address;

use crate::{
    constants::{JUP_PROGRAM, SOLAUTO_MANAGER, WSOL_MINT},
    instructions::referral_fees,
    types::{
        instruction::accounts::{ClaimReferralFeesAccounts, ConvertReferralFeesAccounts},
        shared::{DeserializedAccount, ReferralState, SolautoError},
    },
    utils::solauto_utils,
};

pub fn process_convert_referral_fees<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    let ctx = ConvertReferralFeesAccounts::context(accounts)?;
    let referral_state =
        DeserializedAccount::<ReferralState>::deserialize(Some(ctx.accounts.referral_state))?
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
        vec![
            "route_with_token_ledger",
            "shared_accounts_route_with_token_ledger",
        ],
    );

    let next_ix =
        solauto_utils::get_relative_instruction(ctx.accounts.ixs_sysvar, current_ix_idx, 1, index)?;

    if !jup_swap.matches(&next_ix) {
        msg!("Missing Jup swap as next transaction");
        return Err(SolautoError::IncorrectInstructions.into());
    }

    referral_fees::convert_referral_fees(ctx, referral_state)
}

pub fn process_claim_referral_fees<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    let ctx = ClaimReferralFeesAccounts::context(accounts)?;
    let referral_state =
        DeserializedAccount::<ReferralState>::deserialize(Some(ctx.accounts.referral_state))?
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
        if ctx.accounts.dest_ta.unwrap().key
            != &get_associated_token_address(
                ctx.accounts.signer.key,
                ctx.accounts.referral_fees_mint.key,
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

pub fn process_update_position_instruction() -> ProgramResult {
    // TODO
    Ok(())
}

pub fn process_close_position_instruction() -> ProgramResult {
    // TODO
    Ok(())
}
