use solana_program::{clock::Clock, entrypoint::ProgramResult, msg, sysvar::Sysvar};

use crate::{
    state::solauto_position::{DCASettings, SolautoPosition, SolautoSettingsParameters},
    types::{
        instruction::{
            accounts::{Context, UpdatePositionAccounts},
            UpdatePositionData,
        },
        shared::{DeserializedAccount, SolautoError},
    },
    utils::{ix_utils, solana_utils, solauto_utils, validation_utils},
};

pub fn update_position<'a>(
    ctx: Context<UpdatePositionAccounts<'a>>,
    mut solauto_position: DeserializedAccount<'a, SolautoPosition>,
    new_data: UpdatePositionData,
) -> ProgramResult {
    if new_data.dca.is_some() {
        update_dca(&ctx, &mut solauto_position, &new_data)?;
    }

    if new_data.setting_params.is_some() {
        solauto_position.data.position.setting_params =
            SolautoSettingsParameters::from(new_data.setting_params.unwrap());
    }

    let current_timestamp = Clock::get()?.unix_timestamp as u64;
    validation_utils::validate_position_settings(&solauto_position.data, current_timestamp)?;
    validation_utils::validate_dca_settings(&solauto_position.data.position, current_timestamp)?;

    ix_utils::update_data(&mut solauto_position)
}

fn update_dca<'a, 'b>(
    ctx: &'b Context<UpdatePositionAccounts<'a>>,
    solauto_position: &'b mut DeserializedAccount<'a, SolautoPosition>,
    new_data: &'b UpdatePositionData,
) -> ProgramResult {
    let new_dca = new_data.dca.as_ref().unwrap();

    if solauto_position.data.position.dca.is_active()
        && solauto_position.data.position.dca.dca_in()
        && solauto_position.data.position.dca.debt_to_add_base_unit > 0
    {
        solauto_utils::cancel_dca_in_if_necessary(
            ctx.accounts.signer,
            ctx.accounts.system_program,
            ctx.accounts.token_program,
            solauto_position,
            ctx.accounts.debt_mint,
            ctx.accounts.position_debt_ta,
            ctx.accounts.signer_debt_ta,
        )?;
    }

    solauto_position.data.position.dca = DCASettings::from(new_data.dca.as_ref().unwrap().clone());

    if new_dca.debt_to_add_base_unit > 0 {
        if solauto_position.data.position.debt_mint != *ctx.accounts.debt_mint.unwrap().key {
            msg!("Incorrect debt mint account provided for the given Solauto position");
            return Err(SolautoError::IncorrectAccounts.into());
        }

        solana_utils::init_ata_if_needed(
            ctx.accounts.token_program,
            ctx.accounts.system_program,
            ctx.accounts.signer,
            solauto_position.account_info,
            ctx.accounts.position_debt_ta.unwrap(),
            ctx.accounts.debt_mint.unwrap(),
        )?;

        solauto_utils::initiate_dca_in_if_necessary(
            ctx.accounts.token_program,
            solauto_position,
            ctx.accounts.position_debt_ta,
            ctx.accounts.signer,
            ctx.accounts.signer_debt_ta,
        )?;
    }

    Ok(())
}
