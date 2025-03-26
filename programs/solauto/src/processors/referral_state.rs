use jupiter_sdk::JUPITER_ID;
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    instruction::{get_stack_height, TRANSACTION_LEVEL_STACK_HEIGHT},
    msg,
    program_error::ProgramError,
    sysvar::instructions::{load_current_index_checked, load_instruction_at_checked},
};

use crate::{
    check,
    constants::WSOL_MINT,
    error_if,
    instructions::referral_fees,
    state::referral_state::ReferralState,
    types::{
        errors::SolautoError,
        instruction::{
            accounts::{
                ClaimReferralFeesAccounts, ConvertReferralFeesAccounts,
                UpdateReferralStatesAccounts,
            },
            UpdateReferralStatesArgs,
        },
        shared::DeserializedAccount,
    },
    utils::{ix_utils, solauto_utils, validation_utils},
};

pub fn process_update_referral_states<'a>(
    accounts: &'a [AccountInfo<'a>],
    args: UpdateReferralStatesArgs,
) -> ProgramResult {
    msg!("Instruction: Update referral states");
    let ctx = UpdateReferralStatesAccounts::context(accounts)?;

    check!(
        ctx.accounts.signer.is_signer,
        ProgramError::MissingRequiredSignature
    );
    check!(
        ctx.accounts.referred_by_authority.is_none()
            || ctx.accounts.referred_by_authority.unwrap().key != ctx.accounts.signer.key,
        SolautoError::IncorrectAccounts
    );

    validation_utils::validate_standard_programs(
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

    if ctx.accounts.referred_by_state.is_some() && ctx.accounts.referred_by_authority.is_some() {
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
        None,
        false,
    )
}

pub fn process_convert_referral_fees<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    msg!("Instruction: Convert referral fees");
    let ctx = ConvertReferralFeesAccounts::context(accounts)?;
    let referral_state =
        DeserializedAccount::<ReferralState>::zerocopy(Some(ctx.accounts.referral_state))?.unwrap();

    validation_utils::validate_referral_signer(&referral_state, ctx.accounts.signer, true)?;
    validation_utils::validate_standard_programs(
        Some(ctx.accounts.system_program),
        Some(ctx.accounts.token_program),
        Some(ctx.accounts.ata_program),
        Some(ctx.accounts.rent),
        Some(ctx.accounts.ixs_sysvar),
    )?;

    check!(
        validation_utils::token_account_owned_by(
            ctx.accounts.referral_fees_ta,
            ctx.accounts.referral_state.key,
            None
        )?,
        SolautoError::IncorrectAccounts
    );

    let current_ix_idx = load_current_index_checked(ctx.accounts.ixs_sysvar)?;
    let current_ix = load_instruction_at_checked(current_ix_idx as usize, ctx.accounts.ixs_sysvar)?;
    error_if!(
        current_ix.program_id != crate::ID || get_stack_height() > TRANSACTION_LEVEL_STACK_HEIGHT,
        SolautoError::InstructionIsCPI
    );

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

    check!(jup_swap.matches(1), SolautoError::IncorrectInstructions);

    referral_fees::convert_referral_fees(ctx, referral_state)
}

pub fn process_claim_referral_fees<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    msg!("Instruction: Claim referral fees");
    let ctx = ClaimReferralFeesAccounts::context(accounts)?;

    let referral_state =
        DeserializedAccount::<ReferralState>::zerocopy(Some(ctx.accounts.referral_state))?.unwrap();

    validation_utils::validate_referral_signer(&referral_state, ctx.accounts.signer, true)?;
    validation_utils::validate_standard_programs(
        Some(ctx.accounts.system_program),
        Some(ctx.accounts.token_program),
        None,
        Some(ctx.accounts.rent),
        None,
    )?;

    check!(
        ctx.accounts.referral_authority.key == &referral_state.data.authority,
        SolautoError::IncorrectAccounts
    );
    check!(
        validation_utils::correct_token_account(
            ctx.accounts.referral_fees_dest_ta.key,
            ctx.accounts.referral_state.key,
            &referral_state.data.dest_fees_mint
        ),
        SolautoError::IncorrectAccounts
    );
    check!(
        ctx.accounts.referral_fees_dest_mint.key == &referral_state.data.dest_fees_mint,
        SolautoError::IncorrectAccounts
    );
    error_if!(
        referral_state.data.dest_fees_mint != WSOL_MINT
            && ctx.accounts.fees_destination_ta.is_none(),
        SolautoError::IncorrectAccounts
    );

    if ctx.accounts.fees_destination_ta.is_some() {
        check!(
            validation_utils::correct_token_account(
                ctx.accounts.fees_destination_ta.unwrap().key,
                &referral_state.data.authority,
                &referral_state.data.dest_fees_mint
            ),
            SolautoError::IncorrectAccounts
        );
    }

    referral_fees::claim_referral_fees(ctx, referral_state)
}
