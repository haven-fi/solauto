use borsh::BorshSerialize;
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    instruction::Instruction,
    program::invoke,
    program_error::ProgramError,
};

use crate::types::{ instruction::NewPositionData, shared::{ DeserializedAccount, GeneralPositionData, LendingPlatform, Position } };
use super::{solana_utils::invoke_signed_with_seed, validation_utils};

pub fn update_data<T: BorshSerialize>(
    account: &mut Option<DeserializedAccount<T>>
) -> ProgramResult {
    if account.is_none() {
        return Ok(());
    }
    let mut_account = account.as_mut().unwrap();
    mut_account.data.serialize(&mut &mut mut_account.account_info.data.borrow_mut()[..])?;
    Ok(())
}

pub fn invoke_instruction(
    instruction: Instruction,
    account_infos: &[AccountInfo],
    position_account: &Option<DeserializedAccount<Position>>
) -> ProgramResult {
    if position_account.is_none() {
        invoke(&instruction, account_infos)?;
    } else {
        let position = position_account.as_ref().unwrap();
        invoke_signed_with_seed(
            &instruction,
            account_infos,
            vec![&[position.data.position_id], position.data.authority.as_ref()]
        )?;
    }
    Ok(())
}

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
