use borsh::BorshSerialize;
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, instruction::Instruction, program::invoke,
};

use super::solana_utils::invoke_signed_with_seed;
use crate::types::shared::{DeserializedAccount, Position};

pub fn update_data<T: BorshSerialize>(
    account: &mut Option<DeserializedAccount<T>>,
) -> ProgramResult {
    if account.is_none() {
        return Ok(());
    }
    let mut_account = account.as_mut().unwrap();
    mut_account
        .data
        .serialize(&mut &mut mut_account.account_info.data.borrow_mut()[..])?;
    Ok(())
}

pub fn invoke_instruction(
    instruction: Instruction,
    account_infos: &[AccountInfo],
    solauto_position: &Option<DeserializedAccount<Position>>,
) -> ProgramResult {
    if solauto_position.is_none() {
        invoke(&instruction, account_infos)?;
    } else {
        let position = solauto_position.as_ref().unwrap();
        invoke_signed_with_seed(
            &instruction,
            account_infos,
            vec![
                &[position.data.position_id],
                position.data.authority.as_ref(),
            ],
        )?;
    }
    Ok(())
}
