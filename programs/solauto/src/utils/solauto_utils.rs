use solana_program::{
    account_info::AccountInfo,
    program_error::ProgramError,
};

use crate::types::{
    instruction::PositionData,
    shared::{ DeserializedAccount, GeneralPositionData, LendingPlatform, Position },
};

pub fn create_new_solauto_position<'a>(
    signer: &AccountInfo<'a>,
    solauto_position: Option<&'a AccountInfo<'a>>,
    new_position_data: Option<PositionData>,
    lending_platform: LendingPlatform
) -> Result<Option<DeserializedAccount<'a, Position>>, ProgramError> {
    let data = if !new_position_data.is_none() {
        let data = new_position_data.as_ref().unwrap();
        Some(Position {
            position_id: data.position_id,
            authority: *signer.key,
            lending_platform,
            setting_params: data.setting_params.clone(),
            general_data: GeneralPositionData::default(),
            marginfi_data: data.marginfi_data.clone(),
            solend_data: data.solend_data.clone(),
            kamino_data: data.kamino_data.clone()
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

pub fn get_owner<'a, 'b>(
    solauto_position: &'b Option<DeserializedAccount<'a, Position>>,
    signer: &'a AccountInfo<'a>
) -> &'a AccountInfo<'a> {
    if !solauto_position.is_none() {
        solauto_position.as_ref().unwrap().account_info
    } else {
        signer
    }
}
