use borsh::BorshDeserialize;
use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, pubkey::Pubkey,
};

use crate::{
    processors::{marginfi::*, position::*, referral_state::*},
    types::instruction::Instruction,
};

entrypoint!(process_instruction);

pub fn process_instruction<'a>(
    _program_id: &'a Pubkey,
    accounts: &'a [AccountInfo<'a>],
    data: &'a [u8],
) -> ProgramResult {
    let instruction = Instruction::try_from_slice(data)?;
    match instruction {
        Instruction::UpdateReferralStates(args) => process_update_referral_states(accounts, args),
        Instruction::ConvertReferralFees => process_convert_referral_fees(accounts),
        Instruction::ClaimReferralFees => process_claim_referral_fees(accounts),

        Instruction::MarginfiOpenPosition(args) => {
            process_marginfi_open_position_instruction(accounts, args)
        }

        Instruction::UpdatePosition(settings) => {
            process_update_position_instruction(accounts, settings)
        }
        Instruction::ClosePosition => process_close_position_instruction(accounts),
        Instruction::CancelDCA => process_cancel_dca(accounts),

        Instruction::MarginfiRefreshData(price_type) => {
            process_marginfi_refresh_data(accounts, price_type)
        }
        Instruction::MarginfiProtocolInteraction(action) => {
            process_marginfi_interaction_instruction(accounts, action)
        }
        Instruction::MarginfiRebalance(args) => process_marginfi_rebalance(accounts, args),
    }
}
