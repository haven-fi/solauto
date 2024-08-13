use solana_program::{
    account_info::AccountInfo, declare_id, entrypoint, entrypoint::ProgramResult, pubkey::Pubkey,
};

declare_id!("So11111111111111111111111111111111111111112");

entrypoint!(empty_instruction_processor);

pub fn empty_instruction_processor(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    _data: &[u8],
) -> ProgramResult {
    Ok(())
}
