use borsh::BorshDeserialize;
use solana_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
};

use crate::{ processors::solend::*, types::instruction::Instruction };

entrypoint!(process_instruction);

fn process_instruction<'a>(
    _program_id: &Pubkey,
    accounts: &'a [AccountInfo<'a>],
    data: &[u8]
) -> ProgramResult {
    let instruction = Instruction::try_from_slice(data)?;
    match instruction {
        Instruction::SolendOpenPosition(args) =>
            process_solend_open_position_instruction(accounts, args),
        // TODO: update position
        Instruction::SolendRefreshData => process_solend_refresh_accounts(accounts),
        Instruction::SolendProtocolInteraction(args) =>
            process_solend_interaction_instruction(accounts, args),
        // TODO: refresh ping
    }
}
