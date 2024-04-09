use borsh::BorshDeserialize;
use solana_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};

use crate::{
    processors::{ marginfi::*, general::* },
    types::instruction::Instruction,
};

entrypoint!(process_instruction);

fn process_instruction<'a>(
    _program_id: &Pubkey,
    accounts: &'a [AccountInfo<'a>],
    data: &[u8]
) -> ProgramResult {
    let wip_instruction = || {
        msg!("Instruction is currently a WIP");
        Ok(())
    };

    let instruction = Instruction::try_from_slice(data)?;
    match instruction {
        Instruction::UpdateSolautoAdminSettings => process_update_solauto_admin_settings_instruction(accounts),
        Instruction::SolendOpenPosition(_args) => wip_instruction(),
        Instruction::MarginfiOpenPosition(args) =>
            process_marginfi_open_position_instruction(accounts, args),
        Instruction::UpdatePosition(_settings) => process_update_position_instruction(),
        Instruction::SolendRefreshData => wip_instruction(),
        Instruction::SolendProtocolInteraction(_args) => wip_instruction(),
        // TODO: refresh ping
    }
}
