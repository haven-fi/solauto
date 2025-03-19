use solana_program::{ msg, program_error::ProgramError };

use crate::{
    state::solauto_position::{ SolautoPosition, SolautoRebalanceType, TokenBalanceChange },
    types::{
        instruction::RebalanceSettings,
        shared::{ RebalanceDirection, SolautoError, SwapType, TokenType },
    },
    utils::solauto_utils::SolautoFeesBps,
};

// TODO: do we need this?
pub fn rebalance_from_liquidity_source(
    rebalance_direction: &RebalanceDirection,
    rebalance_args: &RebalanceSettings
) -> TokenType {
    if
        rebalance_direction == &RebalanceDirection::Repay &&
        rebalance_args.swap_type == SwapType::ExactIn
    {
        TokenType::Supply
    } else {
        TokenType::Debt
    }
}

pub fn eligible_for_rebalance(solauto_position: &Box<SolautoPosition>) -> bool {
    // TODO: DCA, limit orders, take profit, stop loss, etc.

    solauto_position.state.liq_utilization_rate_bps <=
        solauto_position.position.setting_params.boost_from_bps() ||
        solauto_position.state.liq_utilization_rate_bps >=
            solauto_position.position.setting_params.repay_from_bps()
}

fn get_target_ltv_bps(
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

    return AdjustedUsdBalances { supply_usd, debt_usd };
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

pub struct RebalanceValues {
    pub debt_adjustment_usd: f64,
    pub rebalance_direction: RebalanceDirection,
    pub token_balance_change: Option<TokenBalanceChange>,
}

pub fn get_rebalance_values(
    solauto_position: &Box<SolautoPosition>,
    rebalance_args: &RebalanceSettings,
    solauto_fees_bps: &SolautoFeesBps
) -> Result<RebalanceValues, ProgramError> {
    let token_balance_change = get_token_balance_change();
    let target_ltv_bps = get_target_ltv_bps(
        solauto_position,
        rebalance_args,
        &token_balance_change
    )?;
    let rebalance_direction = get_rebalance_direction(solauto_position, target_ltv_bps);
    let AdjustedUsdBalances { supply_usd, debt_usd } = get_adjusted_usd_balances(
        solauto_position,
        &token_balance_change
    );
    let lp_fee_bps = get_lp_fee_bps(solauto_position, rebalance_args, &rebalance_direction);

    // TODO: get debt adjustment
    let debt_adjustment_usd = 0.0;

    return Ok(RebalanceValues { debt_adjustment_usd, rebalance_direction, token_balance_change });
}
