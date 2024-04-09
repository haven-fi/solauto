use solana_program::{ account_info::AccountInfo, entrypoint::ProgramResult };

use crate::{
    constants::SOLAUTO_ADMIN_SETTINGS_ACCOUNT_SEEDS,
    types::{
        instruction::accounts::UpdateSolautoAdminSettingsAccounts,
        shared::{ DeserializedAccount, SolautoAdminSettings, SOLAUTO_SETTINGS_ACCOUNT_SPACE },
    },
    utils::*,
};

pub fn process_update_solauto_admin_settings_instruction<'a>(
    accounts: &'a [AccountInfo<'a>]
) -> ProgramResult {
    let ctx = UpdateSolautoAdminSettingsAccounts::context(accounts)?;
    validation_utils::validate_solauto_admin_signer(ctx.accounts.solauto_admin)?;

    let mut solauto_admin_settings = if
        !solana_utils::account_is_rent_exempt(
            ctx.accounts.rent,
            ctx.accounts.solauto_admin_settings
        )?
    {
        solana_utils::init_new_account(
            ctx.accounts.system_program,
            ctx.accounts.rent,
            ctx.accounts.solauto_admin,
            ctx.accounts.solauto_admin_settings,
            &crate::ID,
            vec![SOLAUTO_ADMIN_SETTINGS_ACCOUNT_SEEDS],
            SOLAUTO_SETTINGS_ACCOUNT_SPACE
        )?;

        Some(DeserializedAccount {
            account_info: ctx.accounts.solauto_admin_settings,
            data: Box::new(SolautoAdminSettings {
                fees_wallet: ctx.accounts.fees_wallet.key.clone(),
                fees_token_mint: ctx.accounts.fees_token_mint.key.clone(),
            }),
        })
    } else {
        let mut solauto_settings = DeserializedAccount::<SolautoAdminSettings>::deserialize(
            Some(ctx.accounts.solauto_admin_settings)
        )?;

        let settings = solauto_settings.as_mut().unwrap();
        settings.data.fees_wallet = ctx.accounts.fees_wallet.key.clone();
        settings.data.fees_token_mint = ctx.accounts.fees_token_mint.key.clone();

        solauto_settings
    };

    validation_utils::validate_fees_receiver(
        ctx.accounts.solauto_admin_settings,
        ctx.accounts.fees_token_account
    )?;

    solana_utils::init_ata_if_needed(
        ctx.accounts.token_program,
        ctx.accounts.system_program,
        ctx.accounts.rent,
        ctx.accounts.solauto_admin,
        ctx.accounts.fees_wallet,
        ctx.accounts.fees_token_account,
        ctx.accounts.fees_token_mint
    )?;

    ix_utils::update_data(&mut solauto_admin_settings)
}

pub fn process_update_position_instruction() -> ProgramResult {
    // TODO
    Ok(())
}
