use jupiter_sdk::JUPITER_ID;
use marginfi_sdk::MARGINFI_ID;
use solana_program::{
    instruction::{ get_stack_height, TRANSACTION_LEVEL_STACK_HEIGHT },
    msg,
    program_error::ProgramError,
    sysvar::instructions::load_current_index_checked,
};

use crate::types::{
    instruction::{
        RebalanceSettings,
        SolautoStandardAccounts,
        SOLAUTO_REBALANCE_IX_DISCRIMINATORS,
    },
    shared::{ SolautoRebalanceType, RebalanceStep },
    errors::SolautoError,
};

use super::*;

pub struct RebalanceInstructionIndices {
    pub jup_swap: usize,
    pub marginfi_flash_borrow: Option<usize>,
}

#[inline(always)]
pub fn validate_rebalance_instructions(
    std_accounts: &mut Box<SolautoStandardAccounts>,
    rebalance_type: SolautoRebalanceType
) -> Result<RebalanceInstructionIndices, ProgramError> {
    let ixs_sysvar = std_accounts.ixs_sysvar.unwrap();

    let current_ix_idx = load_current_index_checked(ixs_sysvar)?;
    if get_stack_height() > TRANSACTION_LEVEL_STACK_HEIGHT {
        msg!("Instruction is CPI");
        return Err(SolautoError::InstructionIsCPI.into());
    }

    let solauto_rebalance = ix_utils::InstructionChecker::from(
        ixs_sysvar,
        crate::ID,
        Some(SOLAUTO_REBALANCE_IX_DISCRIMINATORS.to_vec()),
        current_ix_idx
    );
    let jup_swap = ix_utils::InstructionChecker::from_anchor(
        ixs_sysvar,
        JUPITER_ID,
        vec![
            "route",
            "shared_accounts_route",
            "route_with_token_ledger",
            "shared_accounts_route_with_token_ledger",
            "exact_out_route",
            "shared_accounts_exact_out_route"
        ],
        current_ix_idx
    );
    let marginfi_borrow = ix_utils::InstructionChecker::from_anchor(
        ixs_sysvar,
        MARGINFI_ID,
        vec!["lending_account_borrow"],
        current_ix_idx
    );

    let next_ix = 1;
    let ix_2_after = 2;
    let prev_ix = -1;
    let ix_2_before = -2;

    if
        (rebalance_type == SolautoRebalanceType::Regular ||
            rebalance_type == SolautoRebalanceType::None) &&
        jup_swap.matches(next_ix) &&
        solauto_rebalance.matches(ix_2_after)
    {
        std_accounts.solauto_position.data.rebalance.ixs.rebalance_type =
            SolautoRebalanceType::Regular;
        Ok(RebalanceInstructionIndices {
            jup_swap: ((current_ix_idx as i16) + next_ix) as usize,
            marginfi_flash_borrow: None,
        })
    } else if
        (rebalance_type == SolautoRebalanceType::DoubleRebalanceWithFL ||
            rebalance_type == SolautoRebalanceType::None) &&
        jup_swap.matches(next_ix) &&
        solauto_rebalance.matches(ix_2_after)
    {
        std_accounts.solauto_position.data.rebalance.ixs.rebalance_type =
            SolautoRebalanceType::DoubleRebalanceWithFL;
        let marginfi_flash_borrow = if current_ix_idx > 0 && marginfi_borrow.matches(prev_ix) {
            Some(((current_ix_idx as i16) + prev_ix) as usize)
        } else {
            None
        };

        Ok(RebalanceInstructionIndices {
            jup_swap: ((current_ix_idx as i16) + next_ix) as usize,
            marginfi_flash_borrow,
        })
    } else if
        (rebalance_type == SolautoRebalanceType::FLSwapThenRebalance ||
            rebalance_type == SolautoRebalanceType::None) &&
        jup_swap.matches(prev_ix)
    {
        std_accounts.solauto_position.data.rebalance.ixs.rebalance_type =
            SolautoRebalanceType::FLSwapThenRebalance;
        let marginfi_flash_borrow = if current_ix_idx > 1 && marginfi_borrow.matches(ix_2_before) {
            Some(((current_ix_idx as i16) + ix_2_before) as usize)
        } else {
            None
        };

        Ok(RebalanceInstructionIndices {
            jup_swap: ((current_ix_idx as i16) + prev_ix) as usize,
            marginfi_flash_borrow,
        })
    } else if
        (rebalance_type == SolautoRebalanceType::FLRebalanceThenSwap ||
            rebalance_type == SolautoRebalanceType::None) &&
        jup_swap.matches(next_ix)
    {
        std_accounts.solauto_position.data.rebalance.ixs.rebalance_type =
            SolautoRebalanceType::FLRebalanceThenSwap;
        let marginfi_flash_borrow = if current_ix_idx > 0 && marginfi_borrow.matches(prev_ix) {
            Some(((current_ix_idx as i16) + prev_ix) as usize)
        } else {
            None
        };

        Ok(RebalanceInstructionIndices {
            jup_swap: ((current_ix_idx as i16) + next_ix) as usize,
            marginfi_flash_borrow,
        })
    } else {
        msg!("Incorrect rebalance instructions");
        Err(SolautoError::IncorrectInstructions.into())
    }
}

pub fn get_rebalance_step(
    std_accounts: &mut Box<SolautoStandardAccounts>,
    args: &RebalanceSettings
) -> Result<RebalanceStep, ProgramError> {
    let has_rebalance_data = std_accounts.solauto_position.data.rebalance.active();
    if !has_rebalance_data {
        let ix_indices = validate_rebalance_instructions(std_accounts, args.rebalance_type)?;

        if ix_indices.marginfi_flash_borrow.is_some() {
            std_accounts.solauto_position.data.rebalance.ixs.flash_loan_amount =
                ix_utils::get_marginfi_flash_loan_amount(
                    std_accounts.ixs_sysvar.unwrap(),
                    ix_indices.marginfi_flash_borrow,
                    None // &[&swap_source_ta],
                )?;
        }
    }

    let rebalance_step = if
        !has_rebalance_data &&
        matches!(
            std_accounts.solauto_position.data.rebalance.ixs.rebalance_type,
            SolautoRebalanceType::Regular |
                SolautoRebalanceType::DoubleRebalanceWithFL |
                SolautoRebalanceType::FLRebalanceThenSwap
        )
    {
        RebalanceStep::First
    } else {
        RebalanceStep::Final
    };

    Ok(rebalance_step)
}
