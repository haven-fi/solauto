use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, msg, program_error::ProgramError,
};
use spl_associated_token_account::get_associated_token_address;

use crate::{
    constants::{SOLAUTO_ADMIN_SETTINGS_ACCOUNT_SEEDS, WSOL_MINT},
    types::{
        instruction::accounts::{ClaimReferralFeesAccounts, UpdateSolautoAdminSettingsAccounts},
        shared::{
            DeserializedAccount, RefferalState, SolautoAdminSettings,
            SOLAUTO_SETTINGS_ACCOUNT_SPACE,
        },
    },
    utils::*,
};

pub fn process_update_solauto_admin_settings_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
) -> ProgramResult {
    let ctx = UpdateSolautoAdminSettingsAccounts::context(accounts)?;
    validation_utils::validate_solauto_admin_signer(ctx.accounts.solauto_admin)?;

    if ctx.accounts.solauto_fees_mint.key != &WSOL_MINT {
        msg!("Only wSOL fee mint is accepted at the moment");
        return Err(ProgramError::InvalidAccountData.into());
    }

    if ctx.accounts.solauto_fees_receiver_ta.key
        != &get_associated_token_address(
            ctx.accounts.solauto_fees_mint.key,
            ctx.accounts.solauto_fees_mint.key,
        )
    {
        msg!("Incorrect token account for the given token mint");
        return Err(ProgramError::InvalidAccountData.into());
    }

    let mut solauto_admin_settings = if !solana_utils::account_is_rent_exempt(
        ctx.accounts.rent,
        ctx.accounts.solauto_admin_settings,
    )? {
        solana_utils::init_new_account(
            ctx.accounts.system_program,
            ctx.accounts.rent,
            ctx.accounts.solauto_admin,
            ctx.accounts.solauto_admin_settings,
            &crate::ID,
            vec![SOLAUTO_ADMIN_SETTINGS_ACCOUNT_SEEDS],
            SOLAUTO_SETTINGS_ACCOUNT_SPACE,
        )?;

        Some(DeserializedAccount {
            account_info: ctx.accounts.solauto_admin_settings,
            data: Box::new(SolautoAdminSettings {
                fees_wallet: ctx.accounts.solauto_fees_wallet.key.clone(),
                fees_token_mint: ctx.accounts.solauto_fees_mint.key.clone(),
            }),
        })
    } else {
        let mut solauto_settings = DeserializedAccount::<SolautoAdminSettings>::deserialize(Some(
            ctx.accounts.solauto_admin_settings,
        ))?;

        let settings = solauto_settings.as_mut().unwrap();
        settings.data.fees_wallet = ctx.accounts.solauto_fees_wallet.key.clone();
        settings.data.fees_token_mint = ctx.accounts.solauto_fees_mint.key.clone();

        solauto_settings
    };

    validation_utils::validate_fees_receiver(
        ctx.accounts.solauto_admin_settings,
        ctx.accounts.solauto_fees_receiver_ta,
    )?;

    solana_utils::init_ata_if_needed(
        ctx.accounts.token_program,
        ctx.accounts.system_program,
        ctx.accounts.rent,
        ctx.accounts.solauto_admin,
        ctx.accounts.solauto_fees_wallet,
        ctx.accounts.solauto_fees_receiver_ta,
        ctx.accounts.solauto_fees_mint,
    )?;

    ix_utils::update_data(&mut solauto_admin_settings)
}

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
