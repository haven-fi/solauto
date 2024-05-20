use std::{ cmp::{ max, min }, ops::{ Div, Mul, Sub } };

use solana_program::{
    instruction::{ get_stack_height, TRANSACTION_LEVEL_STACK_HEIGHT },
    program_error::ProgramError,
    sysvar::instructions::{ load_current_index_checked, load_instruction_at_checked },
};

use crate::{
    constants::{ JUP_PROGRAM, MARGINFI_PROGRAM },
    types::{
        instruction::{
            RebalanceArgs,
            SolautoStandardAccounts,
            SOLAUTO_REBALANCE_IX_DISCRIMINATORS,
        },
        obligation_position::LendingProtocolObligationPosition,
        shared::{ PositionData, SolautoError, SolautoPosition, SolautoRebalanceStep },
    },
};

use super::{
    ix_utils::{ get_relative_instruction, InstructionChecker },
    math_utils,
    solauto_utils::{ is_dca_instruction, SolautoFeesBps },
};

const DEFAULT_MAX_PRICE_SLIPPAGE_BPS: u16 = 300;
const DEFAULT_RISK_AVERSION_BPS: u16 = 1500;

pub fn get_rebalance_step(
    std_accounts: &SolautoStandardAccounts
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
        Some(SOLAUTO_REBALANCE_IX_DISCRIMINATORS.to_vec())
    );
    let jup_swap = InstructionChecker::from_anchor(
        JUP_PROGRAM,
        vec!["route_with_token_ledger", "shared_accounts_route_with_token_ledger"]
    );
    let marginfi_start_fl = InstructionChecker::from_anchor(
        MARGINFI_PROGRAM,
        vec!["lending_account_start_flashloan"]
    );
    let marginfi_end_fl = InstructionChecker::from_anchor(
        MARGINFI_PROGRAM,
        vec!["lending_account_end_flashloan"]
    );

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

    if
        marginfi_start_fl.matches(&prev_ix) &&
        jup_swap.matches(&next_ix) &&
        solauto_rebalance.matches(&ix_2_after) &&
        marginfi_end_fl.matches(&ix_3_after) &&
        rebalance_instructions == 2
    {
        Ok(SolautoRebalanceStep::StartMarginfiFlashLoanSandwich)
    } else if
        marginfi_start_fl.matches(&ix_3_before) &&
        solauto_rebalance.matches(&ix_2_before) &&
        jup_swap.matches(&prev_ix) &&
        marginfi_end_fl.matches(&next_ix) &&
        rebalance_instructions == 2
    {
        Ok(SolautoRebalanceStep::FinishMarginfiFlashLoanSandwich)
    } else if
        jup_swap.matches(&next_ix) &&
        solauto_rebalance.matches(&ix_2_after) &&
        rebalance_instructions == 2
    {
        Ok(SolautoRebalanceStep::StartSolautoRebalanceSandwich)
    } else if
        jup_swap.matches(&prev_ix) &&
        solauto_rebalance.matches(&ix_2_before) &&
        rebalance_instructions == 2
    {
        Ok(SolautoRebalanceStep::FinishSolautoRebalanceSandwich)
    } else {
        Err(SolautoError::IncorrectInstructions.into())
    }
}

fn get_max_liq_utilization_rate_from_risk_aversion(position: &PositionData) -> u16 {
    let setting_params = position.setting_params.as_ref().unwrap();
    let dca_settings = position.active_dca.as_ref().unwrap();
    if dca_settings.add_to_pos.is_none() {
        return setting_params.repay_from_bps();
    }

    let risk_aversion_bps = dca_settings.add_to_pos.as_ref().unwrap().risk_aversion_bps;
    let risk_aversion_bps = risk_aversion_bps.map_or_else(
        || DEFAULT_RISK_AVERSION_BPS,
        |risk_aversion| risk_aversion
    );

    let maximum_liq_utilization_rate_bps = setting_params
        .repay_from_bps()
        .sub(
            (setting_params.repay_from_bps() as f64).mul(
                (risk_aversion_bps as f64).div(10000.0)
            ) as u16
        );

    maximum_liq_utilization_rate_bps
}

fn dca_progress_percentage(target_periods: u16, periods_passed: u16) -> f64 {
    (1.0).div((target_periods as f64).sub(periods_passed as f64))
}

fn get_additional_amount_to_dca_in(position: &mut PositionData) -> Option<u64> {
    let dca_settings = position.active_dca.as_ref().unwrap();
    if dca_settings.add_to_pos.is_none() {
        return None;
    }

    let dca_progress = dca_progress_percentage(
        dca_settings.target_dca_periods,
        dca_settings.dca_periods_passed
    );
    let base_unit_amount = (position.debt_ta_balance as f64).mul(dca_progress) as u64;
    position.debt_ta_balance -= base_unit_amount;

    Some(base_unit_amount)
}

fn get_target_liq_utilization_rate_from_dca(
    position: &mut PositionData,
    obligation_position: &LendingProtocolObligationPosition
) -> Result<u16, ProgramError> {
    let current_liq_utilization_rate =
        obligation_position.current_liq_utilization_rate_bps() as i16;

    let setting_params = position.setting_params.as_mut().unwrap();
    let dca_settings = position.active_dca.as_ref().unwrap();

    let target_boost_to_bps = dca_settings.target_boost_to_bps.map_or_else(
        || setting_params.boost_to_bps as i16,
        |target_boost_to| target_boost_to as i16
    );

    let dca_progress = dca_progress_percentage(
        dca_settings.target_dca_periods,
        dca_settings.dca_periods_passed
    );

    let boost_param_diff = (setting_params.boost_to_bps as i16).sub(target_boost_to_bps);
    let new_boost_to_bps = (setting_params.boost_to_bps as f64).sub(
        (boost_param_diff as f64).mul(dca_progress)
    ) as u16;
    setting_params.boost_to_bps = new_boost_to_bps;

    let current_rate_diff = current_liq_utilization_rate.sub(target_boost_to_bps);
    let target_rate_bps = (current_liq_utilization_rate as f64).sub(
        (current_rate_diff as f64).mul(dca_progress)
    ) as u16;

    if dca_settings.dca_periods_passed == dca_settings.target_dca_periods - 1 {
        position.active_dca = None;
    } else {
        position.active_dca.as_mut().unwrap().dca_periods_passed += 1;
    }

    Ok(target_rate_bps)
}

fn get_std_target_liq_utilization_rate(
    solauto_position: &SolautoPosition,
    obligation_position: &LendingProtocolObligationPosition,
    rebalance_args: &RebalanceArgs
) -> Result<u16, SolautoError> {
    let current_liq_utilization_rate_bps = obligation_position.current_liq_utilization_rate_bps();

    let target_rate_bps: Result<u16, SolautoError> = if
        rebalance_args.target_liq_utilization_rate_bps.is_none()
    {
        let setting_params = solauto_position.position
            .as_ref()
            .unwrap()
            .setting_params.as_ref()
            .unwrap();

        if current_liq_utilization_rate_bps > setting_params.repay_from_bps() {
            if obligation_position.max_ltv.is_some() {
                Ok(
                    min(
                        setting_params.repay_to_bps,
                        math_utils::get_maximum_repay_to_bps_param(
                            obligation_position.max_ltv.unwrap(),
                            obligation_position.liq_threshold
                        )
                    )
                )
            } else {
                Ok(setting_params.repay_to_bps)
            }
        } else if current_liq_utilization_rate_bps < setting_params.boost_from_bps() {
            Ok(setting_params.boost_to_bps)
        } else {
            return Err(SolautoError::InvalidRebalanceCondition.into());
        }
    } else {
        Ok(rebalance_args.target_liq_utilization_rate_bps.unwrap())
    };

    Ok(target_rate_bps.unwrap())
}

fn get_target_rate_and_dca_amount(
    solauto_position: &mut SolautoPosition,
    obligation_position: &LendingProtocolObligationPosition,
    rebalance_args: &RebalanceArgs,
    current_unix_timestamp: u64
) -> Result<(Option<u16>, Option<u64>), ProgramError> {
    let dca_instruction = is_dca_instruction(
        solauto_position,
        obligation_position,
        rebalance_args,
        current_unix_timestamp
    )?;
    let (target_liq_utilization_rate_bps, amount_to_dca_in) = match dca_instruction {
        true => {
            let position_data = solauto_position.position.as_mut().unwrap();
            let amount_to_dca_in = get_additional_amount_to_dca_in(position_data);

            let target_boost_to_bps = position_data.active_dca
                .as_ref()
                .unwrap().target_boost_to_bps;

            let increasing_leverage =
                target_boost_to_bps.is_some() &&
                target_boost_to_bps.unwrap() >
                    position_data.setting_params.as_ref().unwrap().boost_to_bps;

            if increasing_leverage {
                let max_liq_utilization_rate_bps =
                    get_max_liq_utilization_rate_from_risk_aversion(position_data);
                let target_rate = max(
                    obligation_position.current_liq_utilization_rate_bps(),
                    get_target_liq_utilization_rate_from_dca(position_data, obligation_position)?
                );

                if target_rate > max_liq_utilization_rate_bps {
                    (None, amount_to_dca_in)
                } else {
                    (Some(target_rate), amount_to_dca_in)
                }
            } else {
                (
                    Some(
                        get_target_liq_utilization_rate_from_dca(
                            position_data,
                            obligation_position
                        )?
                    ),
                    amount_to_dca_in,
                )
            }
        }
        false =>
            (
                Some(
                    get_std_target_liq_utilization_rate(
                        solauto_position,
                        obligation_position,
                        rebalance_args
                    )?
                ),
                None,
            ),
    };

    Ok((target_liq_utilization_rate_bps, amount_to_dca_in))
}

pub fn get_rebalance_values(
    solauto_position: &mut SolautoPosition,
    obligation_position: &LendingProtocolObligationPosition,
    rebalance_args: &RebalanceArgs,
    solauto_fees_bps: &SolautoFeesBps,
    current_unix_timestamp: u64
) -> Result<(Option<f64>, Option<u64>), ProgramError> {
    let (target_liq_utilization_rate_bps, amount_to_dca_in) = get_target_rate_and_dca_amount(
        solauto_position,
        obligation_position,
        rebalance_args,
        current_unix_timestamp
    )?;

    let max_price_slippage_bps = rebalance_args.max_price_slippage_bps.map_or_else(
        || DEFAULT_MAX_PRICE_SLIPPAGE_BPS,
        |price_slippage| price_slippage
    );

    let adjustment_fee_bps = if
        amount_to_dca_in.is_some() ||
        (target_liq_utilization_rate_bps.is_some() &&
            obligation_position.current_liq_utilization_rate_bps() <=
                target_liq_utilization_rate_bps.unwrap())
    {
        solauto_fees_bps.total
    } else {
        0
    };

    let debt = obligation_position.debt.as_ref().unwrap();
    let amount_usd_to_dca_in = if amount_to_dca_in.is_some() {
        let amount = math_utils
            ::from_base_unit::<u64, u8, f64>(amount_to_dca_in.unwrap(), debt.decimals)
            .mul(debt.market_price);

        amount.sub(amount.mul((adjustment_fee_bps as f64).div(10000.0)))
    } else {
        0.0
    };
    let total_supply_usd = obligation_position.supply.amount_used.usd_value + amount_usd_to_dca_in;

    let mut debt_adjustment_usd = if target_liq_utilization_rate_bps.is_some() {
        math_utils::calculate_debt_adjustment_usd(
            obligation_position.liq_threshold,
            total_supply_usd,
            obligation_position.debt.as_ref().unwrap().amount_used.usd_value,
            target_liq_utilization_rate_bps.unwrap(),
            adjustment_fee_bps
        )
    } else {
        0.0
    };
    debt_adjustment_usd +=
        debt_adjustment_usd.mul((max_price_slippage_bps as f64).div(10000.0)) +
        amount_usd_to_dca_in.mul((max_price_slippage_bps as f64).div(10000.0));

    Ok((Some(debt_adjustment_usd), amount_to_dca_in))
}

#[cfg(test)]
mod tests {
    use std::ops::Add;

    use num_traits::Pow;
    use solana_program::pubkey::Pubkey;
    use tests::math_utils::{ from_base_unit, to_base_unit };

    use crate::{
        types::{
            obligation_position::PositionTokenUsage,
            shared::{ DCASettings, SolautoSettingsParameters },
            solauto_manager::SolautoManager,
        },
        utils::math_utils::calculate_debt_adjustment_usd,
    };

    use super::*;

    const BOOST_TO_BPS: u16 = 5000;
    const REPAY_TO_BPS: u16 = 7500;

    fn assert_bps_within_margin_of_error(result_bps: u16, expected_bps: u16) {
        println!("{}, {}", result_bps, expected_bps);
        assert!(result_bps >= expected_bps.saturating_sub(1) && result_bps <= expected_bps + 1);
    }

    // CHANGING THESE WILL BREAK TESTS
    fn default_setting_params() -> SolautoSettingsParameters {
        SolautoSettingsParameters {
            boost_to_bps: BOOST_TO_BPS,
            boost_gap: 1000,
            repay_to_bps: REPAY_TO_BPS,
            repay_gap: 500,
        }
    }

    fn standard_solauto_position(
        setting_params: SolautoSettingsParameters,
        active_dca: Option<DCASettings>
    ) -> SolautoPosition {
        let mut data = PositionData::default();
        data.setting_params = Some(setting_params);
        data.active_dca = active_dca;
        SolautoPosition::new(1, Pubkey::default(), Some(data))
    }

    fn create_token_usage(
        market_price: f64,
        decimals: u8,
        amount_used_usd: f64
    ) -> PositionTokenUsage {
        let mut token_usage = PositionTokenUsage::default();
        token_usage.market_price = market_price;
        token_usage.decimals = decimals;
        token_usage.amount_used.usd_value = amount_used_usd;
        token_usage.amount_used.base_unit = token_usage.amount_used.usd_value
            .div(token_usage.market_price)
            .mul((10.0).pow(token_usage.decimals as f64)) as u64;

        token_usage
    }

    fn new_obligation_position(
        position: &mut SolautoPosition,
        liq_utilization_rate_bps: u16
    ) -> LendingProtocolObligationPosition {
        let mut obligation_position = LendingProtocolObligationPosition::default();
        obligation_position.liq_threshold = 0.8;

        let supply_market_price = 100.0;
        let supply_amount = 1000.0;
        obligation_position.supply = create_token_usage(
            supply_market_price,
            6,
            supply_amount.mul(supply_market_price)
        );

        let debt_usd = supply_amount
            .mul(supply_market_price)
            .mul(obligation_position.liq_threshold)
            .mul((liq_utilization_rate_bps as f64).div(10000.0));
        obligation_position.debt = Some(create_token_usage(1.0, 6, debt_usd));

        SolautoManager::refresh_position(&obligation_position, position, 0).unwrap();
        obligation_position
    }

    fn test_rebalance(
        current_timestamp: Option<u64>,
        current_liq_utilization_rate_bps: u16,
        setting_params: Option<SolautoSettingsParameters>,
        dca_settings: Option<DCASettings>
    ) -> Result<
        (SolautoPosition, LendingProtocolObligationPosition, Option<f64>, Option<u64>),
        ProgramError
    > {
        let settings = setting_params.map_or_else(
            || default_setting_params(),
            |settings| settings
        );
        let mut solauto_position = standard_solauto_position(
            settings.clone(),
            dca_settings.clone()
        );
        let obligation_position = new_obligation_position(
            &mut solauto_position,
            current_liq_utilization_rate_bps
        );
        let solauto_fees = SolautoFeesBps::get(false);
        let mut rebalance_args = RebalanceArgs::default();
        rebalance_args.max_price_slippage_bps = Some(0);

        let (debt_adjustment_usd, debt_to_add) = get_rebalance_values(
            &mut solauto_position,
            &obligation_position,
            &rebalance_args,
            &solauto_fees,
            current_timestamp.map_or_else(
                || 0,
                |timestamp| timestamp
            )
        )?;

        Ok((solauto_position, obligation_position, debt_adjustment_usd, debt_to_add))
    }

    fn test_rebalance_with_std_validation(
        current_timestamp: Option<u64>,
        current_liq_utilization_rate_bps: u16,
        expected_utilization_rate_bps: u16,
        setting_params: Option<SolautoSettingsParameters>,
        dca_settings: Option<DCASettings>
    ) -> Result<SolautoPosition, ProgramError> {
        let (solauto_position, mut obligation_position, debt_adjustment_usd, debt_to_add) =
            test_rebalance(
                current_timestamp,
                current_liq_utilization_rate_bps,
                setting_params,
                dca_settings
            )?;

        let boosting = current_liq_utilization_rate_bps < expected_utilization_rate_bps;
        let adjustment_fee_bps = if boosting { SolautoFeesBps::get(false).total } else { 0 };
        let expected_debt_adjustment_usd = calculate_debt_adjustment_usd(
            0.8,
            obligation_position.supply.amount_used.usd_value,
            obligation_position.debt.as_ref().unwrap().amount_used.usd_value,
            expected_utilization_rate_bps,
            adjustment_fee_bps
        );
        let debt_to_add = debt_to_add.map_or_else(
            || 0.0,
            |debt| {
                from_base_unit::<u64, u8, f64>(
                    debt,
                    obligation_position.debt.as_ref().unwrap().decimals
                ).mul(obligation_position.debt.as_ref().unwrap().market_price)
            }
        );
        let expected_debt_adjustment_usd = expected_debt_adjustment_usd + debt_to_add;

        println!(
            "{}, {}",
            debt_adjustment_usd.map_or_else(
                || 0.0,
                |debt| debt
            ),
            expected_debt_adjustment_usd
        );
        assert!(
            debt_adjustment_usd.is_some() &&
                debt_adjustment_usd.unwrap() == expected_debt_adjustment_usd
        );

        // Factor into account the adjustment fee
        let supply_adjustment = expected_debt_adjustment_usd.sub(
            expected_debt_adjustment_usd.mul((adjustment_fee_bps as f64).div(10000.0))
        );
        let supply_adjustment = supply_adjustment.div(obligation_position.supply.market_price);
        obligation_position
            .supply_lent_update(
                to_base_unit::<f64, u8, i64>(supply_adjustment, obligation_position.supply.decimals)
            )
            .unwrap();

        let debt_adjustment = expected_debt_adjustment_usd.div(
            obligation_position.debt.as_ref().unwrap().market_price
        );
        obligation_position
            .debt_borrowed_update(
                to_base_unit::<f64, u8, i64>(
                    debt_adjustment,
                    obligation_position.debt.as_ref().unwrap().decimals
                )
            )
            .unwrap();

        assert_bps_within_margin_of_error(
            obligation_position.current_liq_utilization_rate_bps(),
            expected_utilization_rate_bps
        );

        Ok(solauto_position)
    }

    #[test]
    fn test_invalid_rebalance_condition() {
        let result = test_rebalance(None, 6250, None, None);
        assert!(result.is_err());
        assert!(result.unwrap_err() == SolautoError::InvalidRebalanceCondition.into());

        let result = test_rebalance(None, 4001, None, None);
        assert!(result.is_err());
        assert!(result.unwrap_err() == SolautoError::InvalidRebalanceCondition.into());

        let result = test_rebalance(None, 7999, None, None);
        assert!(result.is_err());
        assert!(result.unwrap_err() == SolautoError::InvalidRebalanceCondition.into());
    }

    #[test]
    fn test_repay() {
        test_rebalance_with_std_validation(None, 8034, REPAY_TO_BPS, None, None).unwrap();
        test_rebalance_with_std_validation(None, 8753, REPAY_TO_BPS, None, None).unwrap();
        test_rebalance_with_std_validation(None, 9243, REPAY_TO_BPS, None, None).unwrap();
    }

    #[test]
    fn test_boost() {
        test_rebalance_with_std_validation(None, 1343, BOOST_TO_BPS, None, None).unwrap();
        test_rebalance_with_std_validation(None, 2232, BOOST_TO_BPS, None, None).unwrap();
        test_rebalance_with_std_validation(None, 3943, BOOST_TO_BPS, None, None).unwrap();
    }

    fn standard_dca_rebalance_validation(
        solauto_position: &SolautoPosition,
        dca_settings: DCASettings,
        setting_params: Option<SolautoSettingsParameters>
    ) {
        let target_boost_to_bps = dca_settings.target_boost_to_bps.map_or_else(
            || 0,
            |target| target
        ) as i16;

        let dca_progress = dca_progress_percentage(
            dca_settings.target_dca_periods,
            dca_settings.dca_periods_passed
        );

        let before_boost_to_bps = setting_params.map_or_else(
            || default_setting_params().boost_to_bps,
            |settings| settings.boost_to_bps
        ) as i16;
        let expected_boost_to_bps = (before_boost_to_bps as f64).sub(
            (before_boost_to_bps.sub(target_boost_to_bps) as f64).mul(dca_progress)
        ) as u16;
        assert_bps_within_margin_of_error(
            solauto_position.position
                .as_ref()
                .unwrap()
                .setting_params.as_ref()
                .unwrap().boost_to_bps,
            expected_boost_to_bps
        );

        if dca_settings.dca_periods_passed == dca_settings.target_dca_periods - 1 {
            assert!(solauto_position.position.as_ref().unwrap().active_dca.is_none());
        } else {
            assert!(
                solauto_position.position
                    .as_ref()
                    .unwrap()
                    .active_dca.as_ref()
                    .unwrap().dca_periods_passed == dca_settings.dca_periods_passed + 1
            );
        }
    }

    fn test_dca_rebalance_with_std_validation(
        current_timestamp: Option<u64>,
        current_liq_utilization_rate_bps: u16,
        dca_settings: DCASettings,
        setting_params: Option<SolautoSettingsParameters>
    ) -> Result<SolautoPosition, ProgramError> {
        let target_boost_to_bps = dca_settings.target_boost_to_bps.map_or_else(
            || 0,
            |target| target
        ) as i16;

        let curr_utilization_rate_diff = (current_liq_utilization_rate_bps as i16).sub(
            target_boost_to_bps
        );
        let dca_progress = dca_progress_percentage(
            dca_settings.target_dca_periods,
            dca_settings.dca_periods_passed
        );

        let solauto_position = test_rebalance_with_std_validation(
            Some(
                current_timestamp.map_or_else(
                    ||
                        dca_settings.unix_start_date.add(
                            dca_settings.dca_interval_seconds.mul(
                                (dca_settings.dca_periods_passed as u64) + 1
                            )
                        ),
                    |timestamp| timestamp
                )
            ),
            current_liq_utilization_rate_bps,
            (current_liq_utilization_rate_bps as f64).sub(
                (curr_utilization_rate_diff as f64).mul(dca_progress)
            ) as u16,
            setting_params.clone(),
            Some(dca_settings.clone())
        )?;

        standard_dca_rebalance_validation(&solauto_position, dca_settings, setting_params);

        Ok(solauto_position)
    }

    fn test_dca_rebalance_with_no_expected_change(
        current_liq_utilization_rate_bps: u16,
        dca_settings: DCASettings,
        setting_params: Option<SolautoSettingsParameters>,
    ) -> Result<SolautoPosition, ProgramError> {
        let (solauto_position, _, debt_adjustment_usd, debt_to_add) = test_rebalance(
            Some(
                dca_settings.unix_start_date.add(
                    dca_settings.dca_interval_seconds.mul(
                        (dca_settings.dca_periods_passed as u64) + 1
                    )
                )
            ),
            current_liq_utilization_rate_bps,
            setting_params.clone(),
            Some(dca_settings.clone())
        )?;

        standard_dca_rebalance_validation(&solauto_position, dca_settings, setting_params);

        println!("::::: {}", debt_adjustment_usd.map_or_else(|| 0.0, |debt| debt));
        assert!(debt_adjustment_usd.is_none() || debt_adjustment_usd.unwrap() == 0.0);
        assert!(debt_to_add.is_none() || debt_to_add.unwrap() == 0);

        Ok(solauto_position)
    }

    #[test]
    fn test_invalid_dca_condition() {
        let result = test_dca_rebalance_with_std_validation(
            Some(14),
            BOOST_TO_BPS + 500,
            DCASettings {
                unix_start_date: 0,
                dca_interval_seconds: 5,
                dca_periods_passed: 2,
                target_dca_periods: 4,
                target_boost_to_bps: Some(0),
                add_to_pos: None,
            },
            None
        );
        assert!(
            result.is_err() && result.unwrap_err() == SolautoError::InvalidRebalanceCondition.into()
        );
    }

    #[test]
    fn test_dca_in() {
        test_dca_rebalance_with_std_validation(
            None,
            BOOST_TO_BPS - 2000,
            DCASettings {
                unix_start_date: 0,
                dca_interval_seconds: 5,
                dca_periods_passed: 0,
                target_dca_periods: 4,
                target_boost_to_bps: Some(BOOST_TO_BPS),
                add_to_pos: None,
            },
            Some(SolautoSettingsParameters {
                boost_to_bps: BOOST_TO_BPS - 2000,
                boost_gap: 500,
                repay_to_bps: REPAY_TO_BPS,
                repay_gap: 500,
            })
        ).unwrap();

        test_dca_rebalance_with_std_validation(
            None,
            0,
            DCASettings {
                unix_start_date: 0,
                dca_interval_seconds: 5,
                dca_periods_passed: 0,
                target_dca_periods: 10,
                target_boost_to_bps: Some(BOOST_TO_BPS),
                add_to_pos: None,
            },
            Some(SolautoSettingsParameters {
                boost_to_bps: 0,
                boost_gap: 500,
                repay_to_bps: REPAY_TO_BPS,
                repay_gap: 500,
            })
        ).unwrap();
        
        test_dca_rebalance_with_std_validation(
            None,
            BOOST_TO_BPS - 500,
            DCASettings {
                unix_start_date: 0,
                dca_interval_seconds: 5,
                dca_periods_passed: 9,
                target_dca_periods: 10,
                target_boost_to_bps: Some(BOOST_TO_BPS),
                add_to_pos: None,
            },
            Some(SolautoSettingsParameters {
                boost_to_bps: BOOST_TO_BPS - 500,
                boost_gap: 500,
                repay_to_bps: REPAY_TO_BPS,
                repay_gap: 500,
            })
        ).unwrap();

        // TODO: we need to fix this somehow
        test_dca_rebalance_with_no_expected_change(
            BOOST_TO_BPS + 1000,
            DCASettings {
                unix_start_date: 0,
                dca_interval_seconds: 5,
                dca_periods_passed: 4,
                target_dca_periods: 10,
                target_boost_to_bps: Some(BOOST_TO_BPS),
                add_to_pos: None,
            },
            Some(SolautoSettingsParameters {
                boost_to_bps: BOOST_TO_BPS - 500,
                boost_gap: 500,
                repay_to_bps: REPAY_TO_BPS,
                repay_gap: 500,
            })
        ).unwrap();
    }

    #[test]
    fn test_dca_in_with_additional_debt() {}

    #[test]
    fn test_dca_out() {
        test_dca_rebalance_with_std_validation(
            None,
            BOOST_TO_BPS + 1000,
            DCASettings {
                unix_start_date: 0,
                dca_interval_seconds: 5,
                dca_periods_passed: 0,
                target_dca_periods: 10,
                target_boost_to_bps: Some(0),
                add_to_pos: None,
            },
            None
        ).unwrap();

        test_dca_rebalance_with_std_validation(
            None,
            BOOST_TO_BPS + 1000,
            DCASettings {
                unix_start_date: 0,
                dca_interval_seconds: 5,
                dca_periods_passed: 9,
                target_dca_periods: 15,
                target_boost_to_bps: Some(1500),
                add_to_pos: None,
            },
            None
        ).unwrap();
        
        test_dca_rebalance_with_std_validation(
            None,
            BOOST_TO_BPS + 1000,
            DCASettings {
                unix_start_date: 0,
                dca_interval_seconds: 5,
                dca_periods_passed: 9,
                target_dca_periods: 10,
                target_boost_to_bps: Some(0),
                add_to_pos: None,
            },
            None
        ).unwrap();

        test_dca_rebalance_with_std_validation(
            None,
            500,
            DCASettings {
                unix_start_date: 0,
                dca_interval_seconds: 5,
                dca_periods_passed: 1,
                target_dca_periods: 15,
                target_boost_to_bps: Some(0),
                add_to_pos: None,
            },
            Some(SolautoSettingsParameters {
                boost_to_bps: BOOST_TO_BPS,
                boost_gap: 500,
                repay_to_bps: REPAY_TO_BPS,
                repay_gap: 500,
            })
        ).unwrap();
    }
}
