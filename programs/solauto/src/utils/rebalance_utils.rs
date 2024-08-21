use jupiter_sdk::JUPITER_ID;
use marginfi_sdk::MARGINFI_ID;
use math_utils::from_bps;
use solana_program::{
    instruction::{get_stack_height, TRANSACTION_LEVEL_STACK_HEIGHT},
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::instructions::load_current_index_checked,
};
use std::{
    cmp::{max, min},
    ops::Mul,
};

use crate::{
    state::solauto_position::{DCASettings, PositionData, SolautoPosition, SolautoRebalanceType},
    types::{
        instruction::{
            RebalanceSettings, SolautoStandardAccounts, SOLAUTO_REBALANCE_IX_DISCRIMINATORS,
        },
        shared::{RebalanceStep, SolautoError},
    },
};

use super::*;

pub struct RebalanceInstructionIndices {
    pub jup_swap: usize,
    pub marginfi_flash_borrow: Option<usize>,
}

#[inline(always)]
pub fn validate_rebalance_instructions(
    std_accounts: &mut Box<SolautoStandardAccounts>,
    rebalance_type: SolautoRebalanceType,
) -> Result<RebalanceInstructionIndices, ProgramError> {
    let ixs_sysvar = std_accounts.ixs_sysvar.unwrap();

    let current_ix_idx = load_current_index_checked(ixs_sysvar)?;
    if get_stack_height() > TRANSACTION_LEVEL_STACK_HEIGHT {
        return Err(SolautoError::InstructionIsCPI.into());
    }

    let solauto_rebalance = ix_utils::InstructionChecker::from(
        ixs_sysvar,
        crate::ID,
        Some(SOLAUTO_REBALANCE_IX_DISCRIMINATORS.to_vec()),
        current_ix_idx,
    );
    let jup_swap = ix_utils::InstructionChecker::from_anchor(
        ixs_sysvar,
        JUPITER_ID,
        vec![
            "route_with_token_ledger",
            "shared_accounts_route_with_token_ledger",
            "exact_out_route",
            "shared_accounts_exact_out_route",
        ],
        current_ix_idx,
    );
    let marginfi_start_fl = ix_utils::InstructionChecker::from_anchor(
        ixs_sysvar,
        MARGINFI_ID,
        vec!["lending_account_start_flashloan"],
        current_ix_idx,
    );
    let marginfi_borrow = ix_utils::InstructionChecker::from_anchor(
        ixs_sysvar,
        MARGINFI_ID,
        vec!["lending_account_borrow"],
        current_ix_idx,
    );
    let marginfi_end_fl = ix_utils::InstructionChecker::from_anchor(
        ixs_sysvar,
        MARGINFI_ID,
        vec!["lending_account_end_flashloan"],
        current_ix_idx,
    );
    let marginfi_repay = ix_utils::InstructionChecker::from_anchor(
        ixs_sysvar,
        MARGINFI_ID,
        vec!["lending_account_repay"],
        current_ix_idx,
    );

    let next_ix = 1;
    let ix_2_after = 2;
    let ix_3_after = 3;
    let ix_4_after = 4;
    let prev_ix = -1;
    let ix_2_before = -2;
    let ix_3_before = -3;

    if (rebalance_type == SolautoRebalanceType::Regular
        || rebalance_type == SolautoRebalanceType::None)
        && jup_swap.matches(next_ix)
        && solauto_rebalance.matches(ix_2_after)
    {
        std_accounts.solauto_position.data.rebalance.rebalance_type = SolautoRebalanceType::Regular;
        Ok(RebalanceInstructionIndices {
            jup_swap: ((current_ix_idx as i16) + next_ix) as usize,
            marginfi_flash_borrow: None,
        })
    } else if (rebalance_type == SolautoRebalanceType::DoubleRebalanceWithFL
        || rebalance_type == SolautoRebalanceType::None)
        && marginfi_start_fl.matches(ix_2_before)
        && marginfi_borrow.matches(prev_ix)
        && jup_swap.matches(next_ix)
        && solauto_rebalance.matches(ix_2_after)
        && marginfi_repay.matches(ix_3_after)
        && marginfi_end_fl.matches(ix_4_after)
    {
        std_accounts.solauto_position.data.rebalance.rebalance_type =
            SolautoRebalanceType::DoubleRebalanceWithFL;
        Ok(RebalanceInstructionIndices {
            jup_swap: ((current_ix_idx as i16) + next_ix) as usize,
            marginfi_flash_borrow: Some(((current_ix_idx as i16) + prev_ix) as usize),
        })
    } else if (rebalance_type == SolautoRebalanceType::SingleRebalanceWithFL
        || rebalance_type == SolautoRebalanceType::None)
        && marginfi_start_fl.matches(ix_3_before)
        && marginfi_borrow.matches(ix_2_before)
        && jup_swap.matches(prev_ix)
        && marginfi_repay.matches(next_ix)
        && marginfi_end_fl.matches(ix_2_after)
    {
        std_accounts.solauto_position.data.rebalance.rebalance_type =
            SolautoRebalanceType::SingleRebalanceWithFL;
        Ok(RebalanceInstructionIndices {
            jup_swap: ((current_ix_idx as i16) + prev_ix) as usize,
            marginfi_flash_borrow: Some(((current_ix_idx as i16) + ix_2_before) as usize),
        })
    } else {
        Err(SolautoError::IncorrectInstructions.into())
    }
}

pub fn get_rebalance_step(
    std_accounts: &mut Box<SolautoStandardAccounts>,
    args: &RebalanceSettings,
    position_tas: Vec<&Pubkey>,
) -> Result<RebalanceStep, ProgramError> {
    let has_rebalance_data = std_accounts.solauto_position.data.rebalance.active();
    if !has_rebalance_data {
        let ix_indices = validate_rebalance_instructions(std_accounts, args.rebalance_type)?;

        let (swap_source_ta, price_slippage_bps) = ix_utils::validate_jup_instruction(
            std_accounts.ixs_sysvar.unwrap(),
            ix_indices.jup_swap,
            position_tas.as_slice(),
        )?;

        std_accounts
            .solauto_position
            .data
            .rebalance
            .price_slippage_bps = price_slippage_bps;

        if ix_indices.marginfi_flash_borrow.is_some() {
            std_accounts
                .solauto_position
                .data
                .rebalance
                .flash_loan_amount = ix_utils::get_marginfi_flash_loan_amount(
                std_accounts.ixs_sysvar.unwrap(),
                ix_indices.marginfi_flash_borrow.unwrap(),
                &[&swap_source_ta],
            )?;
        }
    }

    let rebalance_step = if !has_rebalance_data
        && (std_accounts.solauto_position.data.rebalance.rebalance_type
            == SolautoRebalanceType::Regular
            || std_accounts.solauto_position.data.rebalance.rebalance_type
                == SolautoRebalanceType::DoubleRebalanceWithFL)
    {
        RebalanceStep::Initial
    } else {
        RebalanceStep::Final
    };

    Ok(rebalance_step)
}

#[inline(always)]
fn get_additional_amount_to_dca_in(
    position: &mut PositionData,
    current_unix_timestamp: u64,
) -> Option<u64> {
    if !position.dca.dca_in() {
        return None;
    }

    let updated_debt_dca_balance = position.dca.automation.updated_amount_from_automation(
        position.dca.debt_to_add_base_unit,
        0,
        current_unix_timestamp,
    );
    let debt_to_dca_in = position
        .dca
        .debt_to_add_base_unit
        .saturating_sub(updated_debt_dca_balance);

    position.dca.debt_to_add_base_unit = updated_debt_dca_balance;

    Some(debt_to_dca_in)
}

#[inline(always)]
fn get_target_liq_utilization_rate_from_dca(
    solauto_position: &mut SolautoPosition,
    current_unix_timestamp: u64,
) -> Result<u16, ProgramError> {
    let curr_liq_utilization_rate_bps = solauto_position.state.liq_utilization_rate_bps;
    let position = &mut solauto_position.position;

    let target_rate_bps = {
        if position.dca.dca_in() {
            max(
                curr_liq_utilization_rate_bps,
                position.setting_params.boost_to_bps,
            )
        } else {
            position.setting_params.boost_to_bps
        }
    };

    let new_periods_passed = position
        .dca
        .automation
        .new_periods_passed(current_unix_timestamp);
    if new_periods_passed == position.dca.automation.target_periods {
        position.dca = DCASettings::default();
    } else {
        position.dca.automation.periods_passed = new_periods_passed;
    }

    Ok(target_rate_bps)
}

#[inline(always)]
fn get_std_target_liq_utilization_rate(
    solauto_position: &SolautoPosition,
) -> Result<u16, SolautoError> {
    let setting_params = solauto_position.position.setting_params.clone();

    let target_rate_bps: Result<u16, SolautoError> =
        if solauto_position.state.liq_utilization_rate_bps >= setting_params.repay_from_bps() {
            Ok(setting_params.repay_to_bps)
        } else if solauto_position.state.liq_utilization_rate_bps <= setting_params.boost_from_bps()
        {
            Ok(setting_params.boost_to_bps)
        } else {
            return Err(SolautoError::InvalidRebalanceCondition.into());
        };

    Ok(target_rate_bps.unwrap())
}

#[inline(always)]
fn is_dca_instruction(
    solauto_position: &SolautoPosition,
    current_unix_timestamp: u64,
) -> Result<bool, ProgramError> {
    let position_data = &solauto_position.position;

    if solauto_position.state.liq_utilization_rate_bps
        >= position_data.setting_params.repay_from_bps()
    {
        return Ok(false);
    }

    if !position_data.dca.is_active() {
        return Ok(false);
    }

    if !position_data
        .dca
        .automation
        .eligible_for_next_period(current_unix_timestamp)
    {
        if solauto_position.state.liq_utilization_rate_bps
            <= position_data.setting_params.boost_from_bps()
        {
            return Ok(false);
        } else {
            msg!("DCA rebalance was initiated too early");
            return Err(SolautoError::InvalidRebalanceCondition.into());
        }
    }

    Ok(true)
}

#[inline(always)]
fn get_target_rate_and_dca_amount(
    solauto_position: &mut SolautoPosition,
    rebalance_args: &RebalanceSettings,
    current_unix_timestamp: u64,
) -> Result<(u16, Option<u64>), ProgramError> {
    if rebalance_args.target_liq_utilization_rate_bps.is_some() {
        return Ok((
            rebalance_args.target_liq_utilization_rate_bps.unwrap(),
            None,
        ));
    }

    let dca_instruction = is_dca_instruction(solauto_position, current_unix_timestamp)?;

    let (target_liq_utilization_rate_bps, amount_to_dca_in) = match dca_instruction {
        true => {
            let amount_to_dca_in = get_additional_amount_to_dca_in(
                &mut solauto_position.position,
                current_unix_timestamp,
            );
            let target_liq_utilization_rate_bps =
                get_target_liq_utilization_rate_from_dca(solauto_position, current_unix_timestamp)?;

            (target_liq_utilization_rate_bps, amount_to_dca_in)
        }
        false => (get_std_target_liq_utilization_rate(solauto_position)?, None),
    };

    Ok((target_liq_utilization_rate_bps, amount_to_dca_in))
}

pub fn get_rebalance_values(
    solauto_position: &mut SolautoPosition,
    args: &RebalanceSettings,
    solauto_fees_bps: &solauto_utils::SolautoFeesBps,
    current_unix_timestamp: u64,
) -> Result<(f64, Option<u64>), ProgramError> {
    let (target_liq_utilization_rate_bps, amount_to_dca_in) =
        get_target_rate_and_dca_amount(solauto_position, args, current_unix_timestamp)?;

    solauto_position.rebalance.target_liq_utilization_rate_bps = target_liq_utilization_rate_bps;

    let amount_usd_to_dca_in = if amount_to_dca_in.is_some() {
        math_utils::from_base_unit::<u64, u8, f64>(
            amount_to_dca_in.unwrap(),
            solauto_position.state.debt.decimals,
        )
        .mul(solauto_position.state.debt.market_price())
    } else {
        0.0
    };

    let total_supply_usd =
        solauto_position.state.supply.amount_used.usd_value() + amount_usd_to_dca_in;

    let adjustment_fee_bps = if amount_to_dca_in.is_some()
        || solauto_position.state.liq_utilization_rate_bps <= target_liq_utilization_rate_bps
    {
        solauto_fees_bps.total
    } else {
        0
    };

    let mut debt_adjustment_usd = math_utils::get_std_debt_adjustment_usd(
        from_bps(solauto_position.state.liq_threshold_bps),
        total_supply_usd,
        solauto_position.state.debt.amount_used.usd_value(),
        target_liq_utilization_rate_bps,
        adjustment_fee_bps,
    );

    let price_slippage_bps = solauto_position.rebalance.price_slippage_bps;
    debt_adjustment_usd += debt_adjustment_usd.mul(from_bps(price_slippage_bps))
        + amount_usd_to_dca_in.mul(from_bps(price_slippage_bps));

    Ok((debt_adjustment_usd, amount_to_dca_in))
}

#[cfg(test)]
mod tests {
    use solana_program::pubkey::Pubkey;
    use std::ops::{Add, Div, Sub};
    use tests::math_utils::{from_base_unit, to_base_unit};

    use crate::{
        state::solauto_position::{
            AutomationSettingsInp, DCASettings, DCASettingsInp, PositionState, PositionTokenUsage,
            RebalanceData, SolautoSettingsParameters,
        },
        types::shared::TokenType,
        utils::math_utils,
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
        let mut settings = SolautoSettingsParameters::default();
        settings.boost_to_bps = BOOST_TO_BPS;
        settings.boost_gap = 1000;
        settings.repay_to_bps = REPAY_TO_BPS;
        settings.repay_gap = 500;
        settings
    }

    fn standard_solauto_position(
        setting_params: SolautoSettingsParameters,
        active_dca: Option<DCASettings>,
        current_liq_utilization_rate_bps: u16,
    ) -> SolautoPosition {
        let mut data = PositionData::default();
        data.setting_params = setting_params;

        data.dca = if active_dca.is_some() {
            active_dca.unwrap()
        } else {
            DCASettings::default()
        };

        let mut position =
            SolautoPosition::new(1, Pubkey::default(), data, PositionState::default());

        position.state.liq_threshold_bps = 8000;
        position.state.max_ltv_bps = 6500;
        position.state.liq_utilization_rate_bps = current_liq_utilization_rate_bps;

        let supply_market_price = 100.0;
        let supply_amount = 1000.0;
        position.state.supply = create_token_usage(
            supply_market_price,
            6,
            supply_amount.mul(supply_market_price),
        );

        let debt_usd = supply_amount
            .mul(supply_market_price)
            .mul(from_bps(position.state.liq_threshold_bps))
            .mul(from_bps(current_liq_utilization_rate_bps));
        position.state.debt = create_token_usage(1.0, 6, debt_usd);

        position.rebalance = RebalanceData::default();

        position
    }

    fn create_token_usage(
        market_price: f64,
        decimals: u8,
        amount_used_usd: f64,
    ) -> PositionTokenUsage {
        let mut token_usage = PositionTokenUsage::default();
        token_usage.decimals = decimals;
        token_usage.amount_used.base_unit =
            to_base_unit::<f64, u8, u64>(amount_used_usd.div(market_price), decimals);
        token_usage.update_market_price(market_price);
        token_usage
    }

    fn test_rebalance(
        current_timestamp: Option<u64>,
        current_liq_utilization_rate_bps: u16,
        setting_params: Option<SolautoSettingsParameters>,
        dca_settings: Option<DCASettings>,
        mut rebalance_args: Option<RebalanceSettings>,
    ) -> Result<(SolautoPosition, f64, Option<u64>), ProgramError> {
        let settings = setting_params.map_or_else(|| default_setting_params(), |settings| settings);
        let mut solauto_position = standard_solauto_position(
            settings.clone(),
            dca_settings.clone(),
            current_liq_utilization_rate_bps,
        );
        let solauto_fees = solauto_utils::get_solauto_fees_bps(
            false,
            false,
            solauto_position.state.net_worth.usd_value(),
        );

        if rebalance_args.is_none() {
            rebalance_args = Some(RebalanceSettings::default());
        }

        let (debt_adjustment_usd, debt_to_add) = get_rebalance_values(
            &mut solauto_position,
            rebalance_args.as_ref().unwrap(),
            &solauto_fees,
            current_timestamp.map_or_else(|| 0, |timestamp| timestamp),
        )?;

        Ok((solauto_position, debt_adjustment_usd, debt_to_add))
    }

    fn rebalance_with_std_validation(
        current_timestamp: Option<u64>,
        current_liq_utilization_rate_bps: u16,
        mut expected_liq_utilization_rate_bps: u16,
        setting_params: Option<SolautoSettingsParameters>,
        dca_settings: Option<DCASettings>,
        rebalance_args: Option<RebalanceSettings>,
    ) -> Result<SolautoPosition, ProgramError> {
        let (mut solauto_position, debt_adjustment_usd, debt_to_add) = test_rebalance(
            current_timestamp,
            current_liq_utilization_rate_bps,
            setting_params,
            dca_settings.clone(),
            rebalance_args,
        )?;

        let boosting = debt_to_add.is_some()
            || current_liq_utilization_rate_bps <= expected_liq_utilization_rate_bps;
        if boosting {
            expected_liq_utilization_rate_bps = max(
                expected_liq_utilization_rate_bps,
                current_liq_utilization_rate_bps,
            );
        }
        let adjustment_fee_bps = if boosting {
            solauto_utils::get_solauto_fees_bps(
                false,
                false,
                solauto_position.state.net_worth.usd_value(),
            )
            .total
        } else {
            0
        };

        let debt_to_add_usd = debt_to_add.map_or_else(
            || 0.0,
            |debt| {
                from_base_unit::<u64, u8, f64>(debt, solauto_position.state.debt.decimals)
                    .mul(solauto_position.state.debt.market_price())
            },
        );

        let expected_debt_adjustment_usd = math_utils::get_std_debt_adjustment_usd(
            from_bps(solauto_position.state.liq_threshold_bps),
            solauto_position.state.supply.amount_used.usd_value() + debt_to_add_usd,
            solauto_position.state.debt.amount_used.usd_value(),
            expected_liq_utilization_rate_bps,
            adjustment_fee_bps,
        );
        assert!(debt_adjustment_usd == expected_debt_adjustment_usd);

        // Factor into account the adjustment fee
        let supply_adjustment = (expected_debt_adjustment_usd + debt_to_add_usd)
            .sub(expected_debt_adjustment_usd.mul(from_bps(adjustment_fee_bps)))
            .sub(debt_to_add_usd.mul(from_bps(adjustment_fee_bps)));
        let supply_adjustment = supply_adjustment.div(solauto_position.state.supply.market_price());

        solauto_position.update_usage(
            TokenType::Supply,
            to_base_unit::<f64, u8, i64>(supply_adjustment, solauto_position.state.supply.decimals),
        );

        let debt_adjustment =
            expected_debt_adjustment_usd.div(solauto_position.state.debt.market_price());
        solauto_position.update_usage(
            TokenType::Debt,
            to_base_unit::<f64, u8, i64>(debt_adjustment, solauto_position.state.debt.decimals),
        );

        assert_bps_within_margin_of_error(
            solauto_position.state.liq_utilization_rate_bps,
            expected_liq_utilization_rate_bps,
        );

        Ok(solauto_position)
    }

    #[test]
    fn test_invalid_rebalance_condition() {
        let result = test_rebalance(None, 6250, None, None, None);
        assert!(result.is_err());
        assert!(result.unwrap_err() == SolautoError::InvalidRebalanceCondition.into());

        let result = test_rebalance(None, 4001, None, None, None);
        assert!(result.is_err());
        assert!(result.unwrap_err() == SolautoError::InvalidRebalanceCondition.into());

        let result = test_rebalance(None, 7999, None, None, None);
        assert!(result.is_err());
        assert!(result.unwrap_err() == SolautoError::InvalidRebalanceCondition.into());
    }

    #[test]
    fn test_repay() {
        rebalance_with_std_validation(None, REPAY_TO_BPS + 534, REPAY_TO_BPS, None, None, None)
            .unwrap();
        rebalance_with_std_validation(None, REPAY_TO_BPS + 1003, REPAY_TO_BPS, None, None, None)
            .unwrap();
        rebalance_with_std_validation(None, REPAY_TO_BPS + 1743, REPAY_TO_BPS, None, None, None)
            .unwrap();
    }

    #[test]
    fn test_boost() {
        rebalance_with_std_validation(None, BOOST_TO_BPS - 3657, BOOST_TO_BPS, None, None, None)
            .unwrap();
        rebalance_with_std_validation(None, BOOST_TO_BPS - 2768, BOOST_TO_BPS, None, None, None)
            .unwrap();
        rebalance_with_std_validation(None, BOOST_TO_BPS - 1047, BOOST_TO_BPS, None, None, None)
            .unwrap();
    }

    #[test]
    fn test_authority_rebalance() {
        let target_liq_utilization_rate_bps = BOOST_TO_BPS + (REPAY_TO_BPS - BOOST_TO_BPS) / 2;
        rebalance_with_std_validation(
            None,
            BOOST_TO_BPS - 3657,
            target_liq_utilization_rate_bps,
            None,
            None,
            Some(RebalanceSettings {
                rebalance_type: SolautoRebalanceType::Regular,
                target_liq_utilization_rate_bps: Some(target_liq_utilization_rate_bps),
                limit_gap_bps: None,
            }),
        )
        .unwrap();
    }

    fn test_dca_rebalance_with_std_validation(
        current_timestamp: Option<u64>,
        current_liq_utilization_rate_bps: u16,
        dca_settings: DCASettings,
        setting_params: Option<SolautoSettingsParameters>,
    ) -> Result<SolautoPosition, ProgramError> {
        let settings =
            Some(setting_params.map_or_else(|| default_setting_params(), |settings| settings));

        let expected_liq_utilization_rate_bps = if dca_settings.dca_in() {
            max(
                current_liq_utilization_rate_bps,
                settings.as_ref().unwrap().boost_to_bps,
            )
        } else {
            settings.as_ref().unwrap().boost_to_bps
        };

        let timestamp = current_timestamp.map_or_else(
            || {
                dca_settings.automation.unix_start_date.add(
                    dca_settings
                        .automation
                        .interval_seconds
                        .mul(dca_settings.automation.periods_passed as u64),
                )
            },
            |timestamp| timestamp,
        );
        let solauto_position = rebalance_with_std_validation(
            Some(timestamp),
            current_liq_utilization_rate_bps,
            expected_liq_utilization_rate_bps,
            settings.clone(),
            Some(dca_settings.clone()),
            None,
        )?;

        let new_periods_passed = dca_settings.automation.new_periods_passed(timestamp);
        if new_periods_passed == dca_settings.automation.target_periods {
            assert!(
                !solauto_position.position.dca.is_active(),
                "DCA is still active when it shouldn't be"
            );
        } else {
            assert!(
                solauto_position.position.dca.automation.periods_passed == new_periods_passed,
                "periods_passed != new_periods_passed"
            );
        }

        Ok(solauto_position)
    }

    #[test]
    fn test_invalid_dca_condition() {
        let result = test_dca_rebalance_with_std_validation(
            Some(9),
            BOOST_TO_BPS + 500,
            DCASettings::from(DCASettingsInp {
                automation: AutomationSettingsInp {
                    target_periods: 4,
                    periods_passed: 2,
                    unix_start_date: 0,
                    interval_seconds: 5,
                },
                debt_to_add_base_unit: 0,
            }),
            None,
        );
        assert!(
            result.is_err()
                && result.unwrap_err() == SolautoError::InvalidRebalanceCondition.into()
        );
    }

    #[test]
    fn test_dca_in() {
        let debt_to_add_base_unit: u64 = 10000000;

        // curr_liq_utilization_rate_bps > setting_params.boost_to_bps
        test_dca_rebalance_with_std_validation(
            None,
            BOOST_TO_BPS + 1000,
            DCASettings::from(DCASettingsInp {
                automation: AutomationSettingsInp {
                    target_periods: 10,
                    periods_passed: 4,
                    unix_start_date: 0,
                    interval_seconds: 5,
                },
                debt_to_add_base_unit,
            }),
            None,
        )
        .unwrap();

        // curr_liq_utilization_rate_bps < setting_params.boost_to_bps
        test_dca_rebalance_with_std_validation(
            None,
            BOOST_TO_BPS - 1000,
            DCASettings::from(DCASettingsInp {
                automation: AutomationSettingsInp {
                    target_periods: 10,
                    periods_passed: 4,
                    unix_start_date: 0,
                    interval_seconds: 5,
                },
                debt_to_add_base_unit,
            }),
            None,
        )
        .unwrap();

        // curr_liq_utilization_rate_bps == setting_params.boost_to_bps
        // last dca period
        test_dca_rebalance_with_std_validation(
            None,
            BOOST_TO_BPS,
            DCASettings::from(DCASettingsInp {
                automation: AutomationSettingsInp {
                    target_periods: 10,
                    periods_passed: 9,
                    unix_start_date: 0,
                    interval_seconds: 5,
                },
                debt_to_add_base_unit,
            }),
            None,
        )
        .unwrap();
    }

    #[test]
    fn test_dca_out() {
        // curr_liq_utilization_rate_bps > setting_params.boost_to_bps
        test_dca_rebalance_with_std_validation(
            None,
            BOOST_TO_BPS + 1000,
            DCASettings::from(DCASettingsInp {
                automation: AutomationSettingsInp {
                    target_periods: 5,
                    periods_passed: 3,
                    unix_start_date: 0,
                    interval_seconds: 5,
                },
                debt_to_add_base_unit: 0,
            }),
            None,
        )
        .unwrap();

        // curr_liq_utilization_rate_bps < setting_params.boost_to_bps
        test_dca_rebalance_with_std_validation(
            None,
            BOOST_TO_BPS - 1000,
            DCASettings::from(DCASettingsInp {
                automation: AutomationSettingsInp {
                    target_periods: 5,
                    periods_passed: 3,
                    unix_start_date: 0,
                    interval_seconds: 5,
                },
                debt_to_add_base_unit: 0,
            }),
            None,
        )
        .unwrap();
    }
}
