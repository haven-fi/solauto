use solana_program::{ entrypoint::ProgramResult, program_pack::Pack, rent::Rent, sysvar::Sysvar };
use spl_token::state::Account as TokenAccount;

use crate::{
    constants::WSOL_MINT,
    state::referral_state::ReferralState,
    types::{
        instruction::accounts::{ ClaimReferralFeesAccounts, Context, ConvertReferralFeesAccounts },
        shared::DeserializedAccount,
    },
    utils::solana_utils::{ self, init_ata_if_needed },
};

pub fn convert_referral_fees(
    ctx: Context<ConvertReferralFeesAccounts>,
    referral_state: DeserializedAccount<ReferralState>
) -> ProgramResult {
    let balance = TokenAccount::unpack(&ctx.accounts.referral_fees_ta.data.borrow())?.amount;

    solana_utils::spl_token_transfer(
        ctx.accounts.token_program,
        ctx.accounts.referral_fees_ta,
        ctx.accounts.referral_state,
        ctx.accounts.intermediary_ta,
        balance,
        Some(&referral_state.data.seeds_with_bump())
    )?;

    Ok(())
}

pub fn claim_referral_fees(
    ctx: Context<ClaimReferralFeesAccounts>,
    referral_state: DeserializedAccount<ReferralState>
) -> ProgramResult {
    let referral_state_seeds = &referral_state.data.seeds_with_bump();

    if ctx.accounts.referral_fees_dest_mint.key == &WSOL_MINT {
        if ctx.accounts.signer.key != &referral_state.data.authority {
            init_ata_if_needed(
                ctx.accounts.token_program,
                ctx.accounts.system_program,
                ctx.accounts.signer,
                ctx.accounts.signer,
                ctx.accounts.signer_wsol_ta.unwrap(),
                ctx.accounts.referral_fees_dest_mint
            )?;

            let rent = Rent::get()?;
            let account_rent = rent.minimum_balance(TokenAccount::LEN);
            solana_utils::spl_token_transfer(
                ctx.accounts.token_program,
                ctx.accounts.referral_fees_dest_ta,
                ctx.accounts.referral_state,
                ctx.accounts.signer_wsol_ta.unwrap(),
                account_rent,
                Some(referral_state_seeds)
            )?;
        }

        solana_utils::close_token_account(
            ctx.accounts.token_program,
            ctx.accounts.referral_fees_dest_ta,
            ctx.accounts.referral_authority.unwrap(),
            ctx.accounts.referral_state,
            Some(referral_state_seeds)
        )?;

        solana_utils::init_ata_if_needed(
            ctx.accounts.token_program,
            ctx.accounts.system_program,
            ctx.accounts.signer,
            ctx.accounts.referral_state,
            ctx.accounts.referral_fees_dest_ta,
            ctx.accounts.referral_fees_dest_mint
        )?;
    } else {
        solana_utils::init_ata_if_needed(
            ctx.accounts.token_program,
            ctx.accounts.system_program,
            ctx.accounts.signer,
            ctx.accounts.signer,
            ctx.accounts.fees_destination_ta.unwrap(),
            ctx.accounts.referral_fees_dest_mint
        )?;

        let balance = TokenAccount::unpack(
            &ctx.accounts.referral_fees_dest_ta.data.borrow()
        )?.amount;

        solana_utils::spl_token_transfer(
            ctx.accounts.token_program,
            ctx.accounts.referral_fees_dest_ta,
            ctx.accounts.referral_state,
            ctx.accounts.fees_destination_ta.unwrap(),
            balance,
            Some(referral_state_seeds)
        )?;
    }

    Ok(())
}
