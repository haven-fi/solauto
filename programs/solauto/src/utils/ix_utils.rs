use borsh::BorshSerialize;
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    instruction::Instruction,
    program::invoke,
};

use crate::types::shared::{ DeserializedAccount, Position };
use super::solana_utils::invoke_signed_with_seed;


/// Releases Solauto position lock and writes the updated data to the account
pub fn update_position(position: &mut Option<DeserializedAccount<Position>>) -> ProgramResult {
    if position.is_none() {
        return Ok(());
    }
    let mut_position = position.as_mut().unwrap();
    mut_position.data.serialize(&mut &mut mut_position.account_info.data.borrow_mut()[..])?;
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
