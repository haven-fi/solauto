use borsh::BorshSerialize;
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    instruction::Instruction,
    program::invoke,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::instructions::load_instruction_at_checked,
};

use super::solana_utils::{ invoke_signed_with_seed, get_anchor_ix_discriminator };
use crate::types::shared::{ DeserializedAccount, PositionAccount };

pub fn update_data<T: BorshSerialize>(account: &mut DeserializedAccount<T>) -> ProgramResult {
    account.data.serialize(&mut &mut account.account_info.data.borrow_mut()[..])?;
    Ok(())
}

pub fn invoke_instruction(
    instruction: Instruction,
    account_infos: &[AccountInfo],
    solauto_position: &DeserializedAccount<PositionAccount>
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

pub fn get_relative_instruction(
    ixs_sysvar: &AccountInfo,
    current_ix_idx: u16,
    relative_idx: i16,
    total_ix_in_tx: u16
) -> Result<Option<Instruction>, ProgramError> {
    if
        (current_ix_idx as i16) + relative_idx > 0 &&
        (current_ix_idx as i16) + relative_idx < (total_ix_in_tx as i16)
    {
        Ok(
            Some(
                load_instruction_at_checked(
                    ((current_ix_idx as i16) + relative_idx) as usize,
                    ixs_sysvar
                )?
            )
        )
    } else {
        Ok(None)
    }
}

pub struct InstructionChecker {
    program_id: Pubkey,
    ix_discriminators: Option<Vec<u64>>,
}
impl InstructionChecker {
    pub fn from(program_id: Pubkey, ix_discriminators: Option<Vec<u64>>) -> Self {
        Self {
            program_id,
            ix_discriminators,
        }
    }
    pub fn from_anchor(program_id: Pubkey, namespace: &str, ix_names: Vec<&str>) -> Self {
        let mut ix_discriminators: Vec<u64> = Vec::new();
        for name in ix_names.iter() {
            ix_discriminators.push(get_anchor_ix_discriminator(namespace, name));
        }
        Self {
            program_id,
            ix_discriminators: Some(ix_discriminators),
        }
    }
    pub fn matches(&self, ix: &Option<Instruction>) -> bool {
        if ix.is_none() {
            return false;
        }

        let instruction = ix.as_ref().unwrap();
        if instruction.program_id == self.program_id {
            if instruction.data.len() >= 8 {
                let discriminator: [u8; 8] = instruction.data[0..8]
                    .try_into()
                    .expect("Slice with incorrect length");

                if
                    self.ix_discriminators.is_none() ||
                    self.ix_discriminators
                        .as_ref()
                        .unwrap()
                        .iter()
                        .any(|&x| x == u64::from_le_bytes(discriminator))
                {
                    return true;
                }
            }
        }

        false
    }
}
