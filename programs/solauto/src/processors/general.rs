use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, msg, program_error::ProgramError,
};

use crate::{
    types::{
        instruction::accounts::ClaimReferralFeesAccounts,
        shared::{DeserializedAccount, RefferalState},
    },
    utils::*,
};

pub fn process_update_position_instruction() -> ProgramResult {
    // TODO
    Ok(())
}

pub fn process_close_position_instruction() -> ProgramResult {
    // TODO
    Ok(())
}

pub fn process_claim_referral_fees<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    let ctx = ClaimReferralFeesAccounts::context(accounts)?;
    let referral_state =
        DeserializedAccount::<RefferalState>::deserialize(Some(ctx.accounts.referral_state))?
            .unwrap();

    if !ctx.accounts.signer.is_signer {
        return Err(ProgramError::MissingRequiredSignature.into());
    }

    if ctx.accounts.signer.key != &referral_state.data.authority {
        msg!("Incorrect referral state provided for the given signer");
        return Err(ProgramError::InvalidAccountData.into());
    }

    solana_utils::close_token_account(
        ctx.accounts.token_program,
        ctx.accounts.referral_fees_ta,
        ctx.accounts.signer,
        ctx.accounts.referral_state,
    )?;

    solana_utils::init_ata_if_needed(
        ctx.accounts.token_program,
        ctx.accounts.system_program,
        ctx.accounts.rent,
        ctx.accounts.signer,
        ctx.accounts.referral_state,
        ctx.accounts.referral_fees_ta,
        ctx.accounts.referral_fees_mint,
    )?;

    Ok(())
}
