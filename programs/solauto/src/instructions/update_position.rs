use solana_program::{clock::Clock, entrypoint::ProgramResult, sysvar::Sysvar};

use crate::{
    state::solauto_position::{SolautoPosition, SolautoSettingsParameters},
    types::{
        instruction::{
            accounts::{Context, UpdatePositionAccounts},
            UpdatePositionData,
        },
        shared::DeserializedAccount,
    },
    utils::{ix_utils, validation_utils},
};

pub fn update_position<'a>(
    ctx: Context<UpdatePositionAccounts<'a>>,
    mut solauto_position: DeserializedAccount<'a, SolautoPosition>,
    new_data: UpdatePositionData,
) -> ProgramResult {
    if new_data.settings.is_some() {
        solauto_position.data.position.settings =
            SolautoSettingsParameters::from(new_data.settings.unwrap());
    }

    validation_utils::validate_position_settings(&solauto_position.data)?;

    ix_utils::update_data(&mut solauto_position)
}
