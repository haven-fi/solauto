use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError
};

use crate::types::{ instruction::NewPositionData, shared::{ DeserializedAccount, GeneralPositionData, LendingPlatform, Position } };
use super::validation_utils;

pub fn create_new_solauto_position<'a>(
    signer: &AccountInfo<'a>,
    solauto_position: Option<&'a AccountInfo<'a>>,
    new_position_data: Option<NewPositionData>,
    lending_platform: LendingPlatform,
) -> Result<Option<DeserializedAccount<'a, Position>>, ProgramError> {
    let data = if !new_position_data.is_none() {
        let data = new_position_data.as_ref().unwrap();
        validation_utils::validate_position_settings(&data.setting_params)?;
        Some(Position {
            position_id: data.position_id,
            authority: *signer.key,
            lending_platform,
            setting_params: data.setting_params.clone(),
            general_data: GeneralPositionData::default(),
            solend_data: data.solend_data.clone(),
        })
    } else {
        None
    };

    if !data.is_none() {
        Ok(
            Some(DeserializedAccount::<Position> {
                account_info: solauto_position.unwrap(),
                data: Box::new(data.unwrap()),
            })
        )
    } else {
        Ok(None)
    }
}

pub fn get_owner<'a, 'b>(solauto_position: &'b Option<&'a AccountInfo<'a>>, signer: &'a AccountInfo<'a>) -> &'a AccountInfo<'a> {
    if !solauto_position.is_none() {
        solauto_position.unwrap()
    } else {
        signer
    }
}