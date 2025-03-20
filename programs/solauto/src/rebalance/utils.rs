use solana_program::{ msg, program_error::ProgramError };

use crate::{
    state::solauto_position::{
        RebalanceInstructionData,
        RebalanceStateValues,
        SolautoPosition,
        TokenBalanceChange,
    },
    types::{
        errors::SolautoError,
        instruction::{ RebalanceSettings, SolautoStandardAccounts },
        shared::{ RebalanceDirection, RebalanceStep, SolautoRebalanceType },
    },
    utils::{
        ix_utils::{
            get_flash_borrow_ix_idx,
            get_marginfi_flash_loan_amount,
            validate_rebalance_instructions,
        },
        solauto_utils::SolautoFeesBps,
    },
};

pub fn set_rebalance_ixs_data(
    std_accounts: &mut Box<SolautoStandardAccounts>,
    args: &RebalanceSettings
) -> Result<RebalanceStep, ProgramError> {
    let has_rebalance_data = std_accounts.solauto_position.data.rebalance.active();

    if !has_rebalance_data {
        validate_rebalance_instructions(std_accounts, args.rebalance_type)?;

        let fl_borrow_ix_idx = get_flash_borrow_ix_idx(std_accounts, args.rebalance_type)?;
        let flash_loan_amount = if fl_borrow_ix_idx.is_some() {
            get_marginfi_flash_loan_amount(
                std_accounts.ixs_sysvar.unwrap(),
                fl_borrow_ix_idx,
                None // &[&swap_source_ta],
            )?
        } else {
            0
        };

        std_accounts.solauto_position.data.rebalance.ixs = RebalanceInstructionData::from(
            args.rebalance_type,
            flash_loan_amount
        );
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
        RebalanceStep::PreSwap
    } else {
        RebalanceStep::PostSwap
    };

    Ok(rebalance_step)
}

pub fn eligible_for_rebalance(solauto_position: &Box<SolautoPosition>) -> bool {
    // TODO: DCA, limit orders, take profit, stop loss, etc.

    solauto_position.state.liq_utilization_rate_bps <=
        solauto_position.position.setting_params.boost_from_bps() ||
        solauto_position.state.liq_utilization_rate_bps >=
            solauto_position.position.setting_params.repay_from_bps()
}

fn get_target_liq_utilization_rate_bps(
    solauto_position: &Box<SolautoPosition>,
    rebalance_args: &RebalanceSettings,
    token_balance_change: &Option<TokenBalanceChange>
) -> Result<u16, ProgramError> {
    if rebalance_args.target_liq_utilization_rate_bps.is_some() {
        return Ok(rebalance_args.target_liq_utilization_rate_bps.unwrap());
    }

    if
        solauto_position.state.liq_utilization_rate_bps <=
        solauto_position.position.setting_params.boost_from_bps()
    {
        Ok(solauto_position.position.setting_params.boost_to_bps)
    } else if
        solauto_position.state.liq_utilization_rate_bps >=
        solauto_position.position.setting_params.repay_from_bps()
    {
        Ok(solauto_position.position.setting_params.repay_to_bps)
    } else if token_balance_change.is_some() {
        // TODO: DCA, limit orders, take profit, stop loss, etc.
        Ok(solauto_position.state.liq_utilization_rate_bps)
    } else {
        msg!("Invalid rebalance condition");
        Err(SolautoError::InvalidRebalanceCondition.into())
    }
}

fn get_token_balance_change() -> Option<TokenBalanceChange> {
    None
}

pub struct AdjustedUsdBalances {
    pub supply_usd: f64,
    pub debt_usd: f64,
}

fn get_adjusted_usd_balances(
    solauto_position: &Box<SolautoPosition>,
    token_balance_change: &Option<TokenBalanceChange>
) -> AdjustedUsdBalances {
    let supply_usd = solauto_position.state.supply.amount_used.usd_value();
    let debt_usd = solauto_position.state.debt.amount_used.usd_value();

    // TODO: DCA, limit orders, take profit, stop loss, etc.

    return AdjustedUsdBalances {
        supply_usd,
        debt_usd,
    };
}

fn get_rebalance_direction(
    solauto_position: &Box<SolautoPosition>,
    target_ltv_bps: u16
) -> RebalanceDirection {
    if solauto_position.state.liq_utilization_rate_bps < target_ltv_bps {
        RebalanceDirection::Boost
    } else {
        RebalanceDirection::Repay
    }
}

fn get_lp_fee_bps(
    solauto_position: &Box<SolautoPosition>,
    rebalance_args: &RebalanceSettings,
    rebalance_direction: &RebalanceDirection
) -> u16 {
    // TODO: this needs to be improved, can't just rely on this?
    let token_being_used = if rebalance_direction == &RebalanceDirection::Boost {
        solauto_position.state.debt
    } else {
        solauto_position.state.supply
    };

    let using_flash_loan = matches!(
        rebalance_args.rebalance_type,
        SolautoRebalanceType::DoubleRebalanceWithFL |
            SolautoRebalanceType::FLRebalanceThenSwap |
            SolautoRebalanceType::FLSwapThenRebalance
    );

    if using_flash_loan {
        token_being_used.flash_loan_fee_bps
    } else if rebalance_direction == &RebalanceDirection::Boost {
        token_being_used.borrow_fee_bps
    } else {
        0
    }
}

pub fn get_rebalance_values(
    solauto_position: &Box<SolautoPosition>,
    rebalance_args: &RebalanceSettings,
    solauto_fees_bps: &SolautoFeesBps
) -> Result<RebalanceStateValues, ProgramError> {
    let token_balance_change = get_token_balance_change();
    let target_liq_utilization_rate_bps = get_target_liq_utilization_rate_bps(
        solauto_position,
        rebalance_args,
        &token_balance_change
    )?;
    let rebalance_direction = get_rebalance_direction(
        solauto_position,
        target_liq_utilization_rate_bps
    );
    let AdjustedUsdBalances { mut supply_usd, mut debt_usd } = get_adjusted_usd_balances(
        solauto_position,
        &token_balance_change
    );
    let lp_fee_bps = get_lp_fee_bps(solauto_position, rebalance_args, &rebalance_direction);

    // TODO: get debt adjustment
    let debt_adjustment_usd = 0.0;

    // TODO add debt adjustment to supply_usd and debt_usd

    return Ok(
        RebalanceStateValues::from(rebalance_direction, supply_usd, debt_usd, token_balance_change)
    );
}
