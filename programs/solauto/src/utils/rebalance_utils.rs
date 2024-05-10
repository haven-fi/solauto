use std::{
    cmp::min,
    ops::{Div, Mul, Sub},
};

use solana_program::{
    instruction::{get_stack_height, TRANSACTION_LEVEL_STACK_HEIGHT},
    program_error::ProgramError,
    sysvar::instructions::{load_current_index_checked, load_instruction_at_checked},
};

use crate::{
    constants::{JUP_PROGRAM, MARGINFI_PROGRAM},
    types::{
        instruction::{
            RebalanceArgs, SolautoStandardAccounts, SOLAUTO_REBALANCE_IX_DISCRIMINATORS,
        },
        obligation_position::LendingProtocolObligationPosition,
        shared::{DCADirection, SolautoError, SolautoPosition, SolautoRebalanceStep},
    },
};

use super::{
    ix_utils::{get_relative_instruction, InstructionChecker},
    math_utils,
    solauto_utils::{is_dca_instruction, SolautoFeesBps},
};

pub fn get_rebalance_step(
    std_accounts: &SolautoStandardAccounts,
) -> Result<SolautoRebalanceStep, ProgramError> {
    // TODO notes for typescript client
    // max_price_slippage = 0.03 (300bps) (3%)
    // random_price_volatility = 0.03 (300bps) (3%)
    // 1 - max_price_slippage - random_price_volatility = buffer_room = 94%
    // if transaction fails default to flash loan instruction route and increase max slippage if needed

    // increasing leverage:
    // -
    // if debt + debt adjustment keeps utilization rate under buffer_room, instructions are:
    // solauto rebalance - borrows more debt worth debt_adjustment_usd
    // jup swap - swap debt token to supply token
    // solauto rebalance - payout solauto fees & deposit supply token
    // -
    // IF MARGINFI:
    // start flash loan
    // solauto rebalance - borrow debt token worth debt_adjustment_usd
    // jup swap - swap debt token to supply token
    // solauto rebalance - payout solauto fees & deposit supply token
    // end flash loan
    // -
    // TODO (Kamino/Solend)
    // if debt + debt adjustment brings utilization rate above buffer_room, instructions are:
    // take out flash loan in debt token (+ solauto fees)
    // jup swap - swap debt token to supply token
    // solauto rebalance - payout solauto fees & deposit supply token, borrow equivalent debt token amount from flash borrow ix + flash loan fee
    // repay flash loan in debt token

    // deleveraging:
    // -
    // if supply - debt adjustment keeps utilization rate under buffer_room, instructions are:
    // solauto rebalance - withdraw supply worth debt_adjustment_usd
    // jup swap - swap supply token to debt token
    // solauto rebalance - repay debt with debt token
    // -
    // IF MARGINFI:
    // start flash loan
    // solauto rebalance - withdraw supply token worth debt_adjustment_usd
    // jup swap - swap supply token to debt token
    // solauto rebalance - repay debt token
    // end flash loan
    // -
    // TODO (Kamino/Solend)
    // if supply - debt adjustment brings utilization rate over buffer_room, instructions are:
    // take out flash loan in supply token
    // jup swap - swap supply token to debt token
    // solauto rebalance - repay debt token, & withdraw equivalent supply token amount from flash borrow ix + flash loan fee
    // repay flash loan in supply token

    let ixs_sysvar = std_accounts.ixs_sysvar.unwrap();

    let current_ix_idx = load_current_index_checked(ixs_sysvar)?;
    let current_ix = load_instruction_at_checked(current_ix_idx as usize, ixs_sysvar)?;
    if current_ix.program_id != crate::ID || get_stack_height() > TRANSACTION_LEVEL_STACK_HEIGHT {
        return Err(SolautoError::InstructionIsCPI.into());
    }

    let solauto_rebalance = InstructionChecker::from(
        crate::ID,
        Some(SOLAUTO_REBALANCE_IX_DISCRIMINATORS.to_vec()),
    );
    let jup_swap = InstructionChecker::from_anchor(
        JUP_PROGRAM,
        vec![
            "route_with_token_ledger",
            "shared_accounts_route_with_token_ledger",
        ],
    );
    let marginfi_start_fl =
        InstructionChecker::from_anchor(MARGINFI_PROGRAM, vec!["lending_account_start_flashloan"]);
    let marginfi_end_fl =
        InstructionChecker::from_anchor(MARGINFI_PROGRAM, vec!["lending_account_end_flashloan"]);

    let mut rebalance_instructions = 0;
    let mut index = current_ix_idx;
    loop {
        if let Ok(ix) = load_instruction_at_checked(index as usize, ixs_sysvar) {
            if index != current_ix_idx && solauto_rebalance.matches(&Some(ix)) {
                rebalance_instructions += 1;
            }
        } else {
            break;
        }

        index += 1;
    }

    if rebalance_instructions > 2 {
        return Err(SolautoError::RebalanceAbuse.into());
    }

    let next_ix = get_relative_instruction(ixs_sysvar, current_ix_idx, 1, index)?;
    let ix_2_after = get_relative_instruction(ixs_sysvar, current_ix_idx, 2, index)?;
    let ix_3_after = get_relative_instruction(ixs_sysvar, current_ix_idx, 3, index)?;
    let prev_ix = get_relative_instruction(ixs_sysvar, current_ix_idx, -1, index)?;
    let ix_2_before = get_relative_instruction(ixs_sysvar, current_ix_idx, -2, index)?;
    let ix_3_before = get_relative_instruction(ixs_sysvar, current_ix_idx, -3, index)?;

    if marginfi_start_fl.matches(&prev_ix)
        && jup_swap.matches(&next_ix)
        && solauto_rebalance.matches(&ix_2_after)
        && marginfi_end_fl.matches(&ix_3_after)
        && rebalance_instructions == 2
    {
        Ok(SolautoRebalanceStep::StartMarginfiFlashLoanSandwich)
    } else if marginfi_start_fl.matches(&ix_3_before)
        && solauto_rebalance.matches(&ix_2_before)
        && jup_swap.matches(&prev_ix)
        && marginfi_end_fl.matches(&next_ix)
        && rebalance_instructions == 2
    {
        Ok(SolautoRebalanceStep::FinishMarginfiFlashLoanSandwich)
    } else if jup_swap.matches(&next_ix)
        && solauto_rebalance.matches(&ix_2_after)
        && rebalance_instructions == 2
    {
        Ok(SolautoRebalanceStep::StartSolautoRebalanceSandwich)
    } else if jup_swap.matches(&prev_ix)
        && solauto_rebalance.matches(&ix_2_before)
        && rebalance_instructions == 2
    {
        Ok(SolautoRebalanceStep::FinishSolautoRebalanceSandwich)
    } else {
        Err(SolautoError::IncorrectInstructions.into())
    }
}

fn get_additional_amount_to_dca_in(
    position_account: &mut SolautoPosition,
) -> Result<u64, ProgramError> {
    let position = position_account.position.as_mut().unwrap();

    let dca_settings = position.active_dca.as_ref().unwrap();
    let percent = (1.0)
        .div((dca_settings.target_dca_periods as f64).sub(dca_settings.dca_periods_passed as f64));

    let base_unit_amount = (position.debt_ta_balance as f64).mul(percent) as u64;
    position.debt_ta_balance -= base_unit_amount;

    if dca_settings.dca_periods_passed == dca_settings.target_dca_periods - 1 {
        position.active_dca = None;
    }

    Ok(base_unit_amount)
}

fn target_liq_utilization_rate_bps_from_dca_out(
    position_account: &mut SolautoPosition,
    obligation_position: &LendingProtocolObligationPosition,
) -> Result<u16, ProgramError> {
    let position = position_account.position.as_mut().unwrap();

    let dca_settings = position.active_dca.as_ref().unwrap();
    let percent = (1.0)
        .div((dca_settings.target_dca_periods as f64).sub(dca_settings.dca_periods_passed as f64));

    let setting_params = position.setting_params.as_mut().unwrap();

    let new_boost_from_bps = (setting_params.boost_from_bps as f64)
        .sub((setting_params.boost_from_bps as f64).mul(percent))
        as u16;
    let new_boost_to_bps = if new_boost_from_bps == 0 {
        0
    } else {
        let diff = setting_params.boost_from_bps - new_boost_from_bps;
        setting_params.boost_to_bps - diff
    };
    setting_params.boost_from_bps = new_boost_from_bps;
    setting_params.boost_to_bps = new_boost_to_bps;

    if dca_settings.dca_periods_passed == dca_settings.target_dca_periods - 1 {
        position.active_dca = None;
        position.setting_params = None;
    }

    let current_liq_utilization_rate_bps = obligation_position.current_liq_utilization_rate_bps();
    let target_liq_utilization_rate_bps = (current_liq_utilization_rate_bps as f64)
        .sub((current_liq_utilization_rate_bps as f64).mul(percent))
        as u16;

    Ok(target_liq_utilization_rate_bps)
}

fn get_std_target_liq_utilization_rate_bps(
    position_account: &mut SolautoPosition,
    obligation_position: &LendingProtocolObligationPosition,
    rebalance_args: &RebalanceArgs,
) -> Result<u16, SolautoError> {
    let current_liq_utilization_rate_bps = obligation_position.current_liq_utilization_rate_bps();

    let target_rate_bps: Result<u16, SolautoError> =
        if rebalance_args.target_liq_utilization_rate_bps.is_none() {
            let setting_params = &position_account
                .position
                .as_ref()
                .unwrap()
                .setting_params
                .as_ref()
                .unwrap();
            if current_liq_utilization_rate_bps > setting_params.repay_from_bps {
                let maximum_repay_to_bps = math_utils::get_maximum_repay_to_bps_param(
                    obligation_position.max_ltv,
                    obligation_position.liq_threshold,
                );
                Ok(min(setting_params.repay_to_bps, maximum_repay_to_bps))
            } else if current_liq_utilization_rate_bps < setting_params.boost_from_bps {
                Ok(setting_params.boost_from_bps)
            } else {
                return Err(SolautoError::InvalidRebalanceCondition.into());
            }
        } else {
            Ok(rebalance_args.target_liq_utilization_rate_bps.unwrap())
        };

    Ok(target_rate_bps.unwrap())
}

// TODO write tests for this function
pub fn get_rebalance_values(
    position_account: &mut SolautoPosition,
    obligation_position: &LendingProtocolObligationPosition,
    rebalance_args: &RebalanceArgs,
    solauto_fees_bps: &SolautoFeesBps,
    current_unix_timestamp: u64,
) -> Result<(Option<f64>, Option<u64>), ProgramError> {
    let dca_instruction = is_dca_instruction(
        position_account,
        obligation_position,
        current_unix_timestamp,
    )?;
    let (target_liq_utilization_rate_bps, amount_to_dca_in) = match dca_instruction {
        Some(direction) => match direction {
            DCADirection::In(_) => {
                let amount_to_dca_in = get_additional_amount_to_dca_in(position_account)?;
                (
                    obligation_position.current_liq_utilization_rate_bps(),
                    Some(amount_to_dca_in),
                )
            }
            DCADirection::Out => (
                target_liq_utilization_rate_bps_from_dca_out(
                    position_account,
                    obligation_position,
                )?,
                None,
            ),
        },
        None => (
            get_std_target_liq_utilization_rate_bps(
                position_account,
                obligation_position,
                rebalance_args,
            )?,
            None,
        ),
    };

    let max_price_slippage_bps = if rebalance_args.max_price_slippage_bps.is_some() {
        rebalance_args.max_price_slippage_bps.unwrap()
    } else {
        300
    };

    let increasing_leverage =
        obligation_position.current_liq_utilization_rate_bps() <= target_liq_utilization_rate_bps;

    let adjustment_fee_bps = if increasing_leverage {
        solauto_fees_bps.total
    } else {
        0
    };

    let debt = obligation_position.debt.as_ref().unwrap();
    let amount_usd_to_dca_in = if amount_to_dca_in.is_some() {
        let amount =
            math_utils::from_base_unit::<u64, u8, f64>(amount_to_dca_in.unwrap(), debt.decimals)
                .mul(debt.market_price);

        amount.sub(amount.mul((adjustment_fee_bps as f64).div(10000.0)))
    } else {
        0.0
    };
    let total_supply_usd = obligation_position
        .supply
        .as_ref()
        .unwrap()
        .amount_used
        .usd_value
        + amount_usd_to_dca_in;

    let mut debt_adjustment_usd = math_utils::calculate_debt_adjustment_usd(
        obligation_position.liq_threshold,
        total_supply_usd,
        obligation_position
            .debt
            .as_ref()
            .unwrap()
            .amount_used
            .usd_value,
        target_liq_utilization_rate_bps,
        adjustment_fee_bps,
    );
    debt_adjustment_usd += debt_adjustment_usd.mul((max_price_slippage_bps as f64).div(10000.0))
        + amount_usd_to_dca_in.mul((max_price_slippage_bps as f64).div(10000.0));

    if let Some(DCADirection::In(_)) = dca_instruction {
        let position = position_account.position.as_ref().unwrap();
        let setting_params = position.setting_params.as_ref().unwrap();
        let dca_settings = position.active_dca.as_ref().unwrap();
        let risk_aversion_bps = if dca_settings.dca_risk_aversion_bps.is_some() {
            dca_settings.dca_risk_aversion_bps.unwrap()
        } else {
            1500
        };
        let maximum_liq_utilization_rate_bps = setting_params.repay_from_bps.sub(
            (setting_params.repay_from_bps as f64).mul((risk_aversion_bps as f64).div(10000.0))
                as u16,
        );

        if obligation_position.current_liq_utilization_rate_bps() > maximum_liq_utilization_rate_bps
        {
            return Ok((None, amount_to_dca_in));
        }
    }

    Ok((Some(debt_adjustment_usd), amount_to_dca_in))
}
