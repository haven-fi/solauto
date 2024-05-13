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
        instruction::{
            accounts::{
                ClaimReferralFeesAccounts, ConvertReferralFeesAccounts,
                UpdateReferralStatesAccounts,
            },
            UpdateReferralStatesArgs,
        },
        shared::{DeserializedAccount, ReferralStateAccount, SolautoError},
    },
    utils::{ix_utils, solauto_utils, validation_utils},
};

pub fn process_update_referral_states<'a>(
    accounts: &'a [AccountInfo<'a>],
    args: UpdateReferralStatesArgs,
) -> ProgramResult {
    let ctx = UpdateReferralStatesAccounts::context(accounts)?;

    if !ctx.accounts.signer.is_signer {
        return Err(ProgramError::MissingRequiredSignature.into());
    }

    let mut authority_referral_state = solauto_utils::create_or_update_referral_state(
        ctx.accounts.system_program,
        ctx.accounts.rent,
        ctx.accounts.signer,
        ctx.accounts.signer,
        ctx.accounts.signer_referral_state,
        args.referral_fees_dest_mint,
        ctx.accounts.referred_by_state,
    )?;
    ix_utils::update_data(&mut authority_referral_state)?;

    if ctx.accounts.referred_by_state.is_some() {
        let mut referred_by_state = solauto_utils::create_or_update_referral_state(
            ctx.accounts.system_program,
            ctx.accounts.rent,
            ctx.accounts.signer,
            ctx.accounts.referred_by_authority.unwrap(),
            ctx.accounts.referred_by_state.unwrap(),
            None,
            None,
        )?;
        ix_utils::update_data(&mut referred_by_state)?;
    }

    // TODO for client:
    // client must include a idempotent create token account instruction (only under condition of a first time boost rebalance for every unique referred_by_state and supply token

    validation_utils::validate_referral_accounts(
        &ctx.accounts.signer.key,
        &authority_referral_state,
        ctx.accounts.referred_by_state,
        None,
        false,
    )?;

    Ok(())
}

pub fn process_convert_referral_fees<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    let ctx = ConvertReferralFeesAccounts::context(accounts)?;
    let referral_state = DeserializedAccount::<ReferralStateAccount>::deserialize(Some(
        ctx.accounts.referral_state,
    ))?
    .unwrap();

    if !ctx.accounts.solauto_manager.is_signer {
        return Err(ProgramError::MissingRequiredSignature.into());
    }

    if ctx.accounts.solauto_manager.key != &SOLAUTO_MANAGER {
        msg!("Instruction can only be invoked by the Solauto manager");
        return Err(SolautoError::IncorrectAccounts.into());
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

    let jup_swap = ix_utils::InstructionChecker::from_anchor(
        JUP_PROGRAM,
        vec![
            "route_with_token_ledger",
            "shared_accounts_route_with_token_ledger",
        ],
    );

    let next_ix =
        ix_utils::get_relative_instruction(ctx.accounts.ixs_sysvar, current_ix_idx, 1, index)?;

    if !jup_swap.matches(&next_ix) {
        msg!("Missing Jup swap as next transaction");
        return Err(SolautoError::IncorrectInstructions.into());
    }

    referral_fees::convert_referral_fees(ctx, referral_state)
}

pub fn process_claim_referral_fees<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    let ctx = ClaimReferralFeesAccounts::context(accounts)?;
    let referral_state = DeserializedAccount::<ReferralStateAccount>::deserialize(Some(
        ctx.accounts.referral_state,
    ))?
    .unwrap();

    if !ctx.accounts.signer.is_signer {
        return Err(ProgramError::MissingRequiredSignature.into());
    }

    if ctx.accounts.signer.key != &referral_state.data.authority {
        msg!("Incorrect referral state provided for the given signer");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    if referral_state.data.dest_fees_mint != WSOL_MINT {
        if ctx.accounts.fees_destination_ta.is_none() {
            msg!("Missing fees destination token account when the token mint is not wSOL");
            return Err(SolautoError::IncorrectAccounts.into());
        }

        if ctx.accounts.fees_destination_ta.unwrap().key
            != &get_associated_token_address(
                referral_state.account_info.key,
                ctx.accounts.referral_fees_mint.key,
            )
        {
            msg!(
                "Provided incorrect destination token account for the given signer and token mint"
            );
            return Err(SolautoError::IncorrectAccounts.into());
        }
    }

    referral_fees::claim_referral_fees(ctx)
}
