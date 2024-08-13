use jupiter_sdk::JUPITER_ID;
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    instruction::{get_stack_height, TRANSACTION_LEVEL_STACK_HEIGHT},
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::instructions::{load_current_index_checked, load_instruction_at_checked},
};
use spl_associated_token_account::get_associated_token_address;
use spl_token::state::Account as TokenAccount;

use crate::{
    constants::{SOLAUTO_MANAGER, WSOL_MINT},
    instructions::referral_fees,
    state::referral_state::ReferralState,
    types::{
        instruction::{
            accounts::{
                ClaimReferralFeesAccounts, ConvertReferralFeesAccounts,
                UpdateReferralStatesAccounts,
            },
            UpdateReferralStatesArgs,
        },
        shared::{DeserializedAccount, SolautoError},
    },
    utils::{
        ix_utils::{self, validate_jup_instruction},
        solauto_utils, validation_utils,
    },
};

pub fn process_update_referral_states<'a>(
    accounts: &'a [AccountInfo<'a>],
    args: UpdateReferralStatesArgs,
) -> ProgramResult {
    msg!("Instruction: Update referral states");
    let ctx = UpdateReferralStatesAccounts::context(accounts)?;

    if !ctx.accounts.signer.is_signer {
        return Err(ProgramError::MissingRequiredSignature.into());
    }

    if ctx.accounts.referred_by_authority.is_some()
        && ctx.accounts.referred_by_authority.unwrap().key == ctx.accounts.signer.key
    {
        msg!("Cannot set the referred by as the same as the referral state authority");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    validation_utils::validate_sysvar_accounts(
        Some(ctx.accounts.system_program),
        None,
        None,
        Some(ctx.accounts.rent),
        None,
    )?;

    let mut authority_referral_state = solauto_utils::create_or_update_referral_state(
        ctx.accounts.rent,
        ctx.accounts.signer,
        ctx.accounts.signer,
        ctx.accounts.signer_referral_state,
        args.referral_fees_dest_mint,
        ctx.accounts.referred_by_state,
        args.address_lookup_table,
    )?;
    ix_utils::update_data(&mut authority_referral_state)?;

    if ctx.accounts.referred_by_state.is_some() {
        let mut referred_by_state = solauto_utils::create_or_update_referral_state(
            ctx.accounts.rent,
            ctx.accounts.signer,
            ctx.accounts.referred_by_authority.unwrap(),
            ctx.accounts.referred_by_state.unwrap(),
            None,
            None,
            None,
        )?;
        ix_utils::update_data(&mut referred_by_state)?;
    }

    validation_utils::validate_referral_accounts(
        &ctx.accounts.signer.key,
        &authority_referral_state,
        ctx.accounts.referred_by_state,
        None,
        false,
    )
}

pub fn process_convert_referral_fees<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    msg!("Instruction: Convert referral fees");
    let ctx = ConvertReferralFeesAccounts::context(accounts)?;
    let referral_state =
        DeserializedAccount::<ReferralState>::zerocopy(Some(ctx.accounts.referral_state))?.unwrap();

    let referral_state_pda = Pubkey::create_program_address(
        referral_state.data.seeds_with_bump().as_slice(),
        &crate::ID,
    )?;
    if &referral_state_pda != referral_state.account_info.key {
        msg!("Incorrect referral state account provided");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    if !ctx.accounts.signer.is_signer {
        return Err(ProgramError::MissingRequiredSignature.into());
    }

    if ctx.accounts.signer.key != &referral_state.data.authority
        && ctx.accounts.signer.key != &SOLAUTO_MANAGER
    {
        msg!("Instruction must be invoked by the referral state authority or Solauto manager");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    validation_utils::validate_sysvar_accounts(
        Some(ctx.accounts.system_program),
        Some(ctx.accounts.token_program),
        Some(ctx.accounts.ata_program),
        Some(ctx.accounts.rent),
        Some(ctx.accounts.ixs_sysvar),
    )?;

    let token_account =
        DeserializedAccount::<TokenAccount>::unpack(Some(ctx.accounts.referral_fees_ta))?.unwrap();
    if !validation_utils::token_account_owned_by(&token_account, ctx.accounts.referral_state.key) {
        msg!("Provided incorrect token account for the given referral state account");
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
        ctx.accounts.ixs_sysvar,
        JUPITER_ID,
        vec!["route", "shared_accounts_route"],
        current_ix_idx,
    );

    validate_jup_instruction(
        ctx.accounts.ixs_sysvar,
        (current_ix_idx + 1) as usize,
        &[&get_associated_token_address(
            ctx.accounts.referral_state.key,
            &referral_state.data.dest_fees_mint,
        )],
    )?;

    if !jup_swap.matches(1) {
        msg!("Missing Jup swap as next transaction");
        return Err(SolautoError::IncorrectInstructions.into());
    }

    referral_fees::convert_referral_fees(ctx, referral_state)
}

pub fn process_claim_referral_fees<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    msg!("Instruction: Claim referral fees");
    let ctx = ClaimReferralFeesAccounts::context(accounts)?;

    if !ctx.accounts.signer.is_signer {
        return Err(ProgramError::MissingRequiredSignature.into());
    }

    validation_utils::validate_sysvar_accounts(
        Some(ctx.accounts.system_program),
        Some(ctx.accounts.token_program),
        None,
        Some(ctx.accounts.rent),
        None,
    )?;

    let referral_state =
        DeserializedAccount::<ReferralState>::zerocopy(Some(ctx.accounts.referral_state))?.unwrap();

    let expected_referral_state_address = Pubkey::create_program_address(
        referral_state.data.seeds_with_bump().as_slice(),
        &crate::ID,
    )?;
    if referral_state.account_info.key != &expected_referral_state_address {
        msg!("Incorrect referral state provided for the given signer");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    if ctx.accounts.referral_fees_dest_ta.key
        != &get_associated_token_address(
            ctx.accounts.referral_state.key,
            &referral_state.data.dest_fees_mint,
        )
    {
        msg!("Provided incorrect referral_fees_dest_ta account");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    if referral_state.data.dest_fees_mint != WSOL_MINT && ctx.accounts.fees_destination_ta.is_none()
    {
        msg!("Missing fees destination token account when the token mint is not wSOL");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    referral_fees::claim_referral_fees(ctx, referral_state)
}
