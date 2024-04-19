use solana_program::{entrypoint::ProgramResult, program_pack::Pack};
use spl_token::state::Account as TokenAccount;

use crate::{
    constants::WSOL_MINT,
    types::{
        instruction::accounts::{ClaimReferralFeesAccounts, Context, ConvertReferralFeesAccounts},
        shared::{DeserializedAccount, ReferralState},
    },
    utils::{solana_utils, solauto_utils},
};

pub fn convert_referral_fees(
    ctx: Context<ConvertReferralFeesAccounts>,
    referral_state: DeserializedAccount<ReferralState>,
) -> ProgramResult {
    let balance = TokenAccount::unpack(&ctx.accounts.referral_fees_ta.data.borrow())?.amount;

    solana_utils::spl_token_transfer(
        ctx.accounts.token_program,
        ctx.accounts.referral_fees_ta,
        ctx.accounts.referral_state,
        ctx.accounts.intermediary_ta,
        balance,
        Some(solauto_utils::get_referral_account_seeds(
            &referral_state.data.authority,
        )),
    )?;

    Ok(())
}

pub fn claim_referral_fees(ctx: Context<ClaimReferralFeesAccounts>) -> ProgramResult {
    if ctx.accounts.referral_fees_mint.key == &WSOL_MINT {
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
    } else {
        solana_utils::init_ata_if_needed(
            ctx.accounts.token_program,
            ctx.accounts.system_program,
            ctx.accounts.rent,
            ctx.accounts.signer,
            ctx.accounts.signer,
            ctx.accounts.dest_ta.unwrap(),
            ctx.accounts.referral_fees_mint,
        )?;

        let balance = TokenAccount::unpack(&ctx.accounts.referral_fees_ta.data.borrow())?.amount;

        solana_utils::spl_token_transfer(
            ctx.accounts.token_program,
            ctx.accounts.referral_fees_ta,
            ctx.accounts.referral_state,
            ctx.accounts.dest_ta.unwrap(),
            balance,
            Some(solauto_utils::get_referral_account_seeds(
                ctx.accounts.signer.key,
            )),
        )?;
    }

    Ok(())
}
