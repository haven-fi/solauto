use solana_program::{clock::Clock, entrypoint::ProgramResult, msg, sysvar::Sysvar};

use crate::{
    check,
    state::{
        automation::DCASettings,
        solauto_position::{SolautoPosition, SolautoSettingsParameters},
    },
    types::{
        errors::SolautoError,
        instruction::{
            accounts::{Context, UpdatePositionAccounts},
            UpdatePositionData,
        },
        shared::{DeserializedAccount, TokenType},
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
    validation_utils::validate_position_settings(&solauto_position.data)?;
    validation_utils::validate_dca_settings(&solauto_position.data.position, current_timestamp)?;

    ix_utils::update_data(&mut solauto_position)
}

fn update_dca<'a, 'b>(
    ctx: &'b Context<UpdatePositionAccounts<'a>>,
    solauto_position: &'b mut DeserializedAccount<'a, SolautoPosition>,
    new_data: &'b UpdatePositionData,
) -> ProgramResult {
    let new_dca = new_data.dca.as_ref().unwrap();

    check!(
        !solauto_position.data.position.dca.is_active(),
        SolautoError::IncorrectInstructions
    );

    solauto_position.data.position.dca = DCASettings::from(new_data.dca.as_ref().unwrap().clone());

    if new_dca.dca_in_base_unit > 0 {
        if new_dca.token_type == TokenType::Debt {
            check!(
                solauto_position.data.state.debt.mint == *ctx.accounts.dca_mint.unwrap().key,
                SolautoError::IncorrectAccounts
            );
        } else {
            check!(
                solauto_position.data.state.supply.mint == *ctx.accounts.dca_mint.unwrap().key,
                SolautoError::IncorrectAccounts
            );
        }

        solana_utils::init_ata_if_needed(
            ctx.accounts.token_program,
            ctx.accounts.system_program,
            ctx.accounts.signer,
            solauto_position.account_info,
            ctx.accounts.position_dca_ta.unwrap(),
            ctx.accounts.dca_mint.unwrap(),
        )?;

        solauto_utils::initiate_dca_in_if_necessary(
            ctx.accounts.token_program,
            solauto_position,
            ctx.accounts.position_dca_ta,
            ctx.accounts.signer,
            ctx.accounts.signer_dca_ta,
        )?;
    }

    Ok(())
}
