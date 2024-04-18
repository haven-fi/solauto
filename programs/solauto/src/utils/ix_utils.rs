use borsh::BorshSerialize;
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    instruction::Instruction,
    program::invoke,
};

use super::solana_utils::invoke_signed_with_seed;
use crate::types::shared::{ DeserializedAccount, Position };

pub fn update_data<T: BorshSerialize>(account: &mut DeserializedAccount<T>) -> ProgramResult {
    account.data.serialize(&mut &mut account.account_info.data.borrow_mut()[..])?;
    Ok(())
}

pub fn invoke_instruction(
    instruction: Instruction,
    account_infos: &[AccountInfo],
    solauto_position: &DeserializedAccount<Position>
) -> ProgramResult {
    if solauto_position.data.self_managed {
        invoke(&instruction, account_infos)?;
    } else {
        invoke_signed_with_seed(
            &instruction,
            account_infos,
            vec![&[solauto_position.data.position_id], solauto_position.data.authority.as_ref()]
        )?;
    }
    Ok(())
}
