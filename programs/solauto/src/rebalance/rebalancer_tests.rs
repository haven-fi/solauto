use std::ops::{Div, Mul};

use solana_program::pubkey::Pubkey;
use spl_associated_token_account::get_associated_token_address;

use crate::{
    constants::SOLAUTO_FEES_WALLET,
    state::solauto_position::{
        PositionData, PositionState, RebalanceData, SolautoPosition, SolautoSettingsParameters,
        SolautoSettingsParametersInp,
    },
    types::{
        instruction::RebalanceSettings,
        shared::{
            PodBool, PositionType, RebalanceDirection, RefreshedTokenState, SwapType,
            TokenBalanceAmount,
        },
        solauto::{PositionValues, SolautoCpiAction},
    },
    utils::{
        math_utils::{
            from_base_unit, from_bps, from_rounded_usd_value, get_liq_utilization_rate_bps,
            round_to_decimals, to_base_unit,
        },
        solauto_utils::update_token_state,
        validation_utils,
    },
};

use super::{
    rebalancer::{Rebalancer, RebalancerData, SolautoPositionData, TokenAccountData},
    solauto_fees::SolautoFeesBps,
};

const TEST_TOKEN_DECIMALS: u8 = 9;
const SOLAUTO_FEE_BPS: u16 = 50;
const BORROW_FEE_BPS: u16 = 50;
const FLASH_LOAN_FEE_BPS: u16 = 50;
const SUPPLY_PRICE: f64 = 100.0;
const DEBT_PRICE: f64 = 1.0;
const MAX_LTV_BPS: u16 = 6400;
const LIQ_THRESHOLD_BPS: u16 = 8181;

pub struct FakePosition<'a> {
    values: &'a PositionValues,
    settings: SolautoSettingsParametersInp,
    max_ltv_bps: Option<u16>,
    liq_threshold_bps: Option<u16>,
}

fn create_position<'a>(pos: &FakePosition<'a>) -> Box<SolautoPosition> {
    let mut state = PositionState::default();
    state.max_ltv_bps = pos.max_ltv_bps.unwrap_or(6400);
    state.liq_threshold_bps = pos.liq_threshold_bps.unwrap_or(8181);
    state.liq_utilization_rate_bps = get_liq_utilization_rate_bps(
        pos.values.supply_usd,
        pos.values.debt_usd,
        from_bps(state.liq_threshold_bps),
    );

    let supply_mint = Pubkey::new_unique();
    let debt_mint = Pubkey::new_unique();
    state.supply.mint = supply_mint;
    state.debt.mint = debt_mint;

    update_token_state(
        &mut state.supply,
        &(RefreshedTokenState {
            amount_used: to_base_unit(pos.values.supply_usd / SUPPLY_PRICE, TEST_TOKEN_DECIMALS),
            amount_can_be_used: 0,
            mint: supply_mint,
            decimals: TEST_TOKEN_DECIMALS,
            market_price: SUPPLY_PRICE,
            borrow_fee_bps: None,
        }),
    );
    update_token_state(
        &mut state.debt,
        &(RefreshedTokenState {
            amount_used: to_base_unit(pos.values.debt_usd / DEBT_PRICE, TEST_TOKEN_DECIMALS),
            amount_can_be_used: 0,
            mint: debt_mint,
            decimals: TEST_TOKEN_DECIMALS,
            market_price: DEBT_PRICE,
            borrow_fee_bps: Some(BORROW_FEE_BPS),
        }),
    );

    let mut position_data = PositionData::default();
    position_data.settings = SolautoSettingsParameters::from(pos.settings);

    let position = SolautoPosition::new(
        1,
        Pubkey::new_unique(),
        PositionType::Leverage,
        position_data,
        state,
    );

    Box::new(position)
}

pub struct FakeRebalance<'a> {
    pos: &'a mut Box<SolautoPosition>,
    position_supply_ta_balance: Option<u64>,
    position_debt_ta_balance: Option<u64>,
    rebalance_direction: RebalanceDirection,
}

fn create_rebalancer<'a>(
    data: FakeRebalance<'a>,
    rebalance_args: RebalanceSettings,
    flash_loan_amount: Option<u64>,
) -> Rebalancer<'a> {
    data.pos.rebalance.ixs.rebalance_type = rebalance_args.rebalance_type;
    data.pos.rebalance.ixs.flash_loan_amount = flash_loan_amount.unwrap_or(0);
    data.pos.rebalance.ixs.active = PodBool::new(true);
    data.pos.rebalance.ixs.swap_type = rebalance_args.swap_type.unwrap_or(SwapType::default());

    let position_supply_ta =
        get_associated_token_address(&data.pos.pubkey(), &data.pos.state.supply.mint);
    let position_debt_ta =
        get_associated_token_address(&data.pos.pubkey(), &data.pos.state.debt.mint);
    let position_authority_supply_ta =
        get_associated_token_address(&data.pos.authority, &data.pos.state.supply.mint);
    let position_authority_debt_ta =
        get_associated_token_address(&data.pos.authority, &data.pos.state.debt.mint);

    let fees_mint = if data.rebalance_direction == RebalanceDirection::Boost {
        data.pos.state.supply.mint
    } else {
        data.pos.state.debt.mint
    };
    let solauto_fees_ta = get_associated_token_address(&SOLAUTO_FEES_WALLET, &fees_mint);
    let solauto_fees = SolautoFeesBps::from_mock(SOLAUTO_FEE_BPS, false);

    let rebalancer = Rebalancer::new(RebalancerData {
        rebalance_args,
        solauto_position: SolautoPositionData {
            data: data.pos,
            supply_ta: TokenAccountData::from(
                position_supply_ta,
                data.position_supply_ta_balance.unwrap_or(0),
            ),
            debt_ta: TokenAccountData::from(
                position_debt_ta,
                data.position_debt_ta_balance.unwrap_or(0),
            ),
        },
        authority_supply_ta: Some(TokenAccountData::without_balance(
            position_authority_supply_ta,
        )),
        authority_debt_ta: Some(TokenAccountData::without_balance(
            position_authority_debt_ta,
        )),
        solauto_fees_bps: solauto_fees,
        referred_by_state: None,
        referred_by_ta: None,
        intermediary_ta: TokenAccountData::without_balance(Pubkey::new_unique()),
        solauto_fees_ta: Some(solauto_fees_ta),
    });

    rebalancer
}

fn credit_token_account<'a>(rebalancer: &mut Rebalancer<'a>, ta_pk: Pubkey, base_unit_amount: i64) {
    let credit_ta = |ta: &mut TokenAccountData| {
        println!("Crediting token account with {}", base_unit_amount);
        if base_unit_amount > 0 {
            ta.balance += base_unit_amount as u64;
        } else {
            ta.balance = ta.balance.saturating_sub((base_unit_amount * -1) as u64);
        }
    };

    if ta_pk == rebalancer.data.solauto_position.supply_ta.pk {
        credit_ta(&mut rebalancer.data.solauto_position.supply_ta);
    } else if ta_pk == rebalancer.data.solauto_position.debt_ta.pk {
        credit_ta(&mut rebalancer.data.solauto_position.debt_ta);
    } else if ta_pk == rebalancer.data.intermediary_ta.pk {
        credit_ta(&mut rebalancer.data.intermediary_ta);
    } else if ta_pk == rebalancer.data.authority_supply_ta.as_ref().unwrap().pk {
        credit_ta(&mut rebalancer.data.authority_supply_ta.as_mut().unwrap());
    } else if ta_pk == rebalancer.data.authority_debt_ta.as_ref().unwrap().pk {
        credit_ta(&mut rebalancer.data.authority_debt_ta.as_mut().unwrap());
    } else {
        println!("Couldn't find token account");
    }
}

fn apply_actions<'a>(rebalancer: &mut Rebalancer<'a>) {
    println!("Actions: {}", rebalancer.actions().len());

    for action in rebalancer.actions().clone() {
        match action {
            SolautoCpiAction::Deposit(amount) => {
                println!("Deposit {}", amount);
                rebalancer
                    .data
                    .solauto_position
                    .data
                    .state
                    .supply
                    .update_usage(amount as i64);
                credit_token_account(
                    rebalancer,
                    rebalancer.data.solauto_position.supply_ta.pk,
                    (amount as i64) * -1,
                );
            }
            SolautoCpiAction::Withdraw(data) => {
                let base_unit_amount = if let TokenBalanceAmount::Some(amount) = data.amount {
                    amount
                } else {
                    rebalancer
                        .data
                        .solauto_position
                        .data
                        .state
                        .supply
                        .amount_used
                        .base_unit
                };
                println!("Withdraw {}", base_unit_amount);
                rebalancer
                    .data
                    .solauto_position
                    .data
                    .state
                    .supply
                    .update_usage((base_unit_amount as i64) * -1);
                credit_token_account(rebalancer, data.to_wallet_ta, base_unit_amount as i64);
            }
            SolautoCpiAction::Borrow(data) => {
                println!("Borrow {}", data.amount);
                rebalancer
                    .data
                    .solauto_position
                    .data
                    .state
                    .debt
                    .update_usage(data.amount as i64);
                credit_token_account(rebalancer, data.to_wallet_ta, data.amount as i64);
            }
            SolautoCpiAction::Repay(data) => {
                let base_unit_amount = if let TokenBalanceAmount::Some(amount) = data {
                    amount
                } else {
                    rebalancer
                        .data
                        .solauto_position
                        .data
                        .state
                        .debt
                        .amount_used
                        .base_unit
                };
                println!("Repay {}", base_unit_amount);
                rebalancer
                    .data
                    .solauto_position
                    .data
                    .state
                    .debt
                    .update_usage((base_unit_amount as i64) * -1);
                credit_token_account(
                    rebalancer,
                    rebalancer.data.solauto_position.debt_ta.pk,
                    (base_unit_amount as i64) * -1,
                );
            }
            SolautoCpiAction::SplTokenTransfer(args) => {
                println!("Transfer from {}", args.amount);
                credit_token_account(rebalancer, args.from_wallet_ta, (args.amount as i64) * -1);
                credit_token_account(rebalancer, args.to_wallet_ta, args.amount as i64);
            }
        }
    }

    rebalancer.reset_actions();
}

fn perform_swap<'a>(
    rebalancer: &mut Rebalancer<'a>,
    rebalance_direction: &RebalanceDirection,
    to_solauto_position_ta: bool,
) -> u64 {
    let (input_price, output_price) = if rebalance_direction == &RebalanceDirection::Boost {
        (DEBT_PRICE, SUPPLY_PRICE)
    } else {
        (SUPPLY_PRICE, DEBT_PRICE)
    };

    let swap_usd_value = from_base_unit::<u64, u8, f64>(
        rebalancer.data.intermediary_ta.balance,
        TEST_TOKEN_DECIMALS,
    )
    .mul(input_price);

    println!("Swapping ${}", swap_usd_value);

    rebalancer.data.intermediary_ta.balance = 0;

    let output_amount =
        to_base_unit::<f64, u8, u64>(swap_usd_value.div(output_price), TEST_TOKEN_DECIMALS);

    if to_solauto_position_ta {
        if rebalance_direction == &RebalanceDirection::Boost {
            credit_token_account(
                rebalancer,
                rebalancer.data.solauto_position.supply_ta.pk,
                output_amount as i64,
            );
        } else {
            credit_token_account(
                rebalancer,
                rebalancer.data.solauto_position.debt_ta.pk,
                output_amount as i64,
            );
        }
    }

    output_amount
}

fn validate_rebalance<'a>(rebalancer: &mut Rebalancer<'a>) {
    assert_eq!(
        round_to_decimals(
            from_rounded_usd_value(
                rebalancer
                    .data
                    .solauto_position
                    .data
                    .rebalance
                    .values
                    .target_debt_usd
            ),
            4
        ),
        round_to_decimals(
            rebalancer
                .data
                .solauto_position
                .data
                .state
                .debt
                .amount_used
                .usd_value(),
            4
        ),
        "Incorrect debt usd. Expected (left) vs. actual (right)"
    );
    assert_eq!(
        round_to_decimals(
            from_rounded_usd_value(
                rebalancer
                    .data
                    .solauto_position
                    .data
                    .rebalance
                    .values
                    .target_supply_usd
            ),
            4
        ),
        round_to_decimals(
            rebalancer
                .data
                .solauto_position
                .data
                .state
                .supply
                .amount_used
                .usd_value(),
            4
        ),
        "Incorrect supply usd. Expected (left) vs. actual (right)"
    );

    assert!(validation_utils::validate_rebalance(rebalancer.data.solauto_position.data).is_ok());
    rebalancer.data.solauto_position.data.rebalance = RebalanceData::default();
}

mod tests {
    use std::ops::{Add, Div};

    use crate::{
        types::{
            shared::{RebalanceStep, SolautoRebalanceType, SwapType},
            solauto::RebalanceFeesBps,
        },
        utils::math_utils::{get_debt_adjustment, get_max_boost_to_bps, get_max_repay_to_bps},
    };

    use super::*;

    #[test]
    fn test_standard_rebalance_boost() {
        let pos_values = PositionValues {
            supply_usd: 100.0,
            debt_usd: 25.0,
        };
        let rebalance_to = 3800;
        let rebalance_direction = RebalanceDirection::Boost;

        let settings = SolautoSettingsParametersInp {
            boost_gap: 50,
            boost_to_bps: rebalance_to,
            repay_gap: 50,
            repay_to_bps: get_max_repay_to_bps(MAX_LTV_BPS, LIQ_THRESHOLD_BPS),
        };
        let mut position = create_position(
            &(FakePosition {
                values: &pos_values,
                settings,
                max_ltv_bps: Some(MAX_LTV_BPS),
                liq_threshold_bps: Some(LIQ_THRESHOLD_BPS),
            }),
        );
        let debt_adjustment = get_debt_adjustment(
            LIQ_THRESHOLD_BPS,
            &pos_values,
            rebalance_to,
            &(RebalanceFeesBps {
                solauto: SOLAUTO_FEE_BPS,
                lp_borrow: BORROW_FEE_BPS,
                flash_loan: 0,
            }),
        );
        let rebalance_args = RebalanceSettings {
            rebalance_type: SolautoRebalanceType::Regular,
            target_liq_utilization_rate_bps: None,
            swap_in_amount_base_unit: Some(to_base_unit(
                debt_adjustment.debt_adjustment_usd.div(DEBT_PRICE),
                TEST_TOKEN_DECIMALS,
            )),
            flash_loan_fee_bps: None,
            swap_type: Some(SwapType::ExactIn),
            price_type: None,
        };
        let rebalancer = &mut create_rebalancer(
            FakeRebalance {
                pos: &mut position,
                position_supply_ta_balance: None,
                position_debt_ta_balance: None,
                rebalance_direction: rebalance_direction.clone(),
            },
            rebalance_args,
            None,
        );

        let res = rebalancer.rebalance(RebalanceStep::PreSwap);
        assert!(res.is_ok());
        apply_actions(rebalancer);

        perform_swap(rebalancer, &rebalance_direction, true);

        let res = rebalancer.rebalance(RebalanceStep::PostSwap);
        assert!(res.is_ok());
        apply_actions(rebalancer);

        validate_rebalance(rebalancer);
    }

    #[test]
    fn test_standard_rebalance_repay() {
        let pos_values = PositionValues {
            supply_usd: 100.0,
            debt_usd: 50.0,
        };
        let rebalance_to = 5000;
        let rebalance_direction = RebalanceDirection::Repay;

        let settings = SolautoSettingsParametersInp {
            boost_gap: 50,
            boost_to_bps: 2000,
            repay_gap: 50,
            repay_to_bps: rebalance_to,
        };
        let mut position = create_position(
            &(FakePosition {
                values: &pos_values,
                settings,
                max_ltv_bps: Some(MAX_LTV_BPS),
                liq_threshold_bps: Some(LIQ_THRESHOLD_BPS),
            }),
        );
        let debt_adjustment = get_debt_adjustment(
            LIQ_THRESHOLD_BPS,
            &pos_values,
            rebalance_to,
            &(RebalanceFeesBps {
                solauto: SOLAUTO_FEE_BPS,
                lp_borrow: BORROW_FEE_BPS,
                flash_loan: 0,
            }),
        );
        let rebalance_args = RebalanceSettings {
            rebalance_type: SolautoRebalanceType::Regular,
            target_liq_utilization_rate_bps: None,
            swap_in_amount_base_unit: Some(to_base_unit(
                debt_adjustment.debt_adjustment_usd.abs().div(SUPPLY_PRICE),
                TEST_TOKEN_DECIMALS,
            )),
            flash_loan_fee_bps: None,
            swap_type: Some(SwapType::ExactIn),
            price_type: None,
        };
        let rebalancer = &mut create_rebalancer(
            FakeRebalance {
                pos: &mut position,
                position_supply_ta_balance: None,
                position_debt_ta_balance: None,
                rebalance_direction: rebalance_direction.clone(),
            },
            rebalance_args,
            None,
        );

        let res = rebalancer.rebalance(RebalanceStep::PreSwap);
        assert!(res.is_ok());
        apply_actions(rebalancer);

        perform_swap(rebalancer, &rebalance_direction, true);

        let res = rebalancer.rebalance(RebalanceStep::PostSwap);
        assert!(res.is_ok());
        apply_actions(rebalancer);

        validate_rebalance(rebalancer);
    }

    // TODO: when token balance changes pre-swap are needed
    // #[test]
    // fn test_double_rebalance_fl_boost() {}

    // #[test]
    // fn test_double_rebalance_fl_repay() {}

    #[test]
    fn test_swap_then_rebalance_boost() {
        let pos_values = PositionValues {
            supply_usd: 100.0,
            debt_usd: 0.0,
        };
        let rebalance_to = get_max_boost_to_bps(MAX_LTV_BPS, LIQ_THRESHOLD_BPS);
        let rebalance_direction = RebalanceDirection::Boost;

        let settings = SolautoSettingsParametersInp {
            boost_gap: 50,
            boost_to_bps: rebalance_to,
            repay_gap: 50,
            repay_to_bps: rebalance_to,
        };
        let mut position = create_position(
            &(FakePosition {
                values: &pos_values,
                settings,
                max_ltv_bps: Some(MAX_LTV_BPS),
                liq_threshold_bps: Some(LIQ_THRESHOLD_BPS),
            }),
        );

        let debt_adjustment = get_debt_adjustment(
            LIQ_THRESHOLD_BPS,
            &pos_values,
            rebalance_to,
            &(RebalanceFeesBps {
                solauto: SOLAUTO_FEE_BPS,
                lp_borrow: BORROW_FEE_BPS,
                flash_loan: FLASH_LOAN_FEE_BPS,
            }),
        );
        let flash_borrow = to_base_unit(
            debt_adjustment.debt_adjustment_usd.abs().div(DEBT_PRICE),
            TEST_TOKEN_DECIMALS,
        );

        let rebalance_args = RebalanceSettings {
            rebalance_type: SolautoRebalanceType::FLSwapThenRebalance,
            target_liq_utilization_rate_bps: None,
            swap_in_amount_base_unit: Some(flash_borrow),
            flash_loan_fee_bps: Some(FLASH_LOAN_FEE_BPS),
            swap_type: Some(SwapType::ExactIn),
            price_type: None,
        };
        let rebalancer = &mut create_rebalancer(
            FakeRebalance {
                pos: &mut position,
                position_supply_ta_balance: None,
                position_debt_ta_balance: None,
                rebalance_direction: rebalance_direction.clone(),
            },
            rebalance_args,
            Some(flash_borrow),
        );

        credit_token_account(
            rebalancer,
            rebalancer.data.intermediary_ta.pk,
            flash_borrow as i64,
        );

        perform_swap(rebalancer, &rebalance_direction, true);

        let res = rebalancer.rebalance(RebalanceStep::PostSwap);
        assert!(res.is_ok());
        apply_actions(rebalancer);

        validate_rebalance(rebalancer);
    }

    #[test]
    fn test_swap_then_rebalance_repay() {
        let pos_values = PositionValues {
            supply_usd: 100.0,
            debt_usd: 70.0,
        };
        let rebalance_to = 1000;
        let rebalance_direction = RebalanceDirection::Repay;

        let settings = SolautoSettingsParametersInp {
            boost_gap: 50,
            boost_to_bps: 3000,
            repay_gap: 50,
            repay_to_bps: get_max_repay_to_bps(MAX_LTV_BPS, LIQ_THRESHOLD_BPS),
        };
        let mut position = create_position(
            &(FakePosition {
                values: &pos_values,
                settings,
                max_ltv_bps: Some(MAX_LTV_BPS),
                liq_threshold_bps: Some(LIQ_THRESHOLD_BPS),
            }),
        );

        let debt_adjustment = get_debt_adjustment(
            LIQ_THRESHOLD_BPS,
            &pos_values,
            rebalance_to,
            &(RebalanceFeesBps {
                solauto: SOLAUTO_FEE_BPS,
                lp_borrow: BORROW_FEE_BPS,
                flash_loan: FLASH_LOAN_FEE_BPS,
            }),
        );
        let flash_borrow = to_base_unit(
            debt_adjustment.debt_adjustment_usd.abs().div(SUPPLY_PRICE),
            TEST_TOKEN_DECIMALS,
        );

        let rebalance_args = RebalanceSettings {
            rebalance_type: SolautoRebalanceType::FLSwapThenRebalance,
            target_liq_utilization_rate_bps: Some(rebalance_to),
            swap_in_amount_base_unit: Some(flash_borrow),
            flash_loan_fee_bps: Some(FLASH_LOAN_FEE_BPS),
            swap_type: Some(SwapType::ExactIn),
            price_type: None,
        };
        let rebalancer = &mut create_rebalancer(
            FakeRebalance {
                pos: &mut position,
                position_supply_ta_balance: None,
                position_debt_ta_balance: None,
                rebalance_direction: rebalance_direction.clone(),
            },
            rebalance_args,
            Some(flash_borrow),
        );

        credit_token_account(
            rebalancer,
            rebalancer.data.intermediary_ta.pk,
            flash_borrow as i64,
        );

        perform_swap(rebalancer, &rebalance_direction, true);

        let res = rebalancer.rebalance(RebalanceStep::PostSwap);
        assert!(res.is_ok());
        apply_actions(rebalancer);

        validate_rebalance(rebalancer);
    }

    // TODO: double rebalance with flash loan exact out swap will not work currently. What needs to change?

    #[test]
    fn test_rebalance_then_swap_repay() {
        let pos_values = PositionValues {
            supply_usd: 100.0,
            debt_usd: 70.0,
        };
        let rebalance_to = 1000;
        let rebalance_direction = RebalanceDirection::Repay;

        let settings = SolautoSettingsParametersInp {
            boost_gap: 50,
            boost_to_bps: rebalance_to,
            repay_gap: 50,
            repay_to_bps: rebalance_to,
        };
        let mut position = create_position(
            &(FakePosition {
                values: &pos_values,
                settings,
                max_ltv_bps: Some(MAX_LTV_BPS),
                liq_threshold_bps: Some(LIQ_THRESHOLD_BPS),
            }),
        );

        let debt_adjustment = get_debt_adjustment(
            LIQ_THRESHOLD_BPS,
            &pos_values,
            rebalance_to,
            &(RebalanceFeesBps {
                solauto: SOLAUTO_FEE_BPS,
                lp_borrow: BORROW_FEE_BPS,
                flash_loan: 0,
            }),
        );

        println!("{}", debt_adjustment.debt_adjustment_usd.abs());
        let rebalance_args = RebalanceSettings {
            rebalance_type: SolautoRebalanceType::FLRebalanceThenSwap,
            target_liq_utilization_rate_bps: None,
            swap_in_amount_base_unit: Some(to_base_unit(
                debt_adjustment.debt_adjustment_usd.abs().div(SUPPLY_PRICE),
                TEST_TOKEN_DECIMALS,
            )),
            flash_loan_fee_bps: None,
            swap_type: Some(SwapType::ExactOut),
            price_type: None,
        };
        let rebalancer = &mut create_rebalancer(
            FakeRebalance {
                pos: &mut position,
                position_supply_ta_balance: None,
                position_debt_ta_balance: None,
                rebalance_direction: rebalance_direction.clone(),
            },
            rebalance_args,
            None,
        );

        let flash_borrow = to_base_unit(
            debt_adjustment.debt_adjustment_usd.abs().div(DEBT_PRICE),
            TEST_TOKEN_DECIMALS,
        );
        credit_token_account(
            rebalancer,
            rebalancer.data.solauto_position.debt_ta.pk,
            flash_borrow,
        );

        let res = rebalancer.rebalance(RebalanceStep::PreSwap);
        assert!(res.is_ok());
        apply_actions(rebalancer);

        validate_rebalance(rebalancer);

        let swap_output_amount = perform_swap(rebalancer, &rebalance_direction, false);

        assert_eq!(
            round_to_decimals(from_base_unit(swap_output_amount, TEST_TOKEN_DECIMALS), 4),
            round_to_decimals(from_base_unit(flash_borrow as u64, TEST_TOKEN_DECIMALS), 4),
            "Flash loan repayment (left) doesn't match expected (right)"
        );
    }

    #[test]
    fn test_target_liq_utilization_rate_rebalance() {
        let pos_values = PositionValues {
            supply_usd: 100.0,
            debt_usd: 25.0,
        };
        let rebalance_to = 3500;
        let rebalance_direction = RebalanceDirection::Boost;

        let settings = SolautoSettingsParametersInp {
            boost_gap: 50,
            boost_to_bps: rebalance_to + 300,
            repay_gap: 50,
            repay_to_bps: get_max_repay_to_bps(MAX_LTV_BPS, LIQ_THRESHOLD_BPS),
        };
        let mut position = create_position(
            &(FakePosition {
                values: &pos_values,
                settings,
                max_ltv_bps: Some(MAX_LTV_BPS),
                liq_threshold_bps: Some(LIQ_THRESHOLD_BPS),
            }),
        );
        let debt_adjustment = get_debt_adjustment(
            LIQ_THRESHOLD_BPS,
            &pos_values,
            rebalance_to,
            &(RebalanceFeesBps {
                solauto: SOLAUTO_FEE_BPS,
                lp_borrow: BORROW_FEE_BPS,
                flash_loan: 0,
            }),
        );
        let rebalance_args = RebalanceSettings {
            rebalance_type: SolautoRebalanceType::Regular,
            target_liq_utilization_rate_bps: Some(rebalance_to),
            swap_in_amount_base_unit: Some(to_base_unit(
                debt_adjustment.debt_adjustment_usd.div(DEBT_PRICE),
                TEST_TOKEN_DECIMALS,
            )),
            flash_loan_fee_bps: None,
            swap_type: Some(SwapType::ExactIn),
            price_type: None,
        };
        let rebalancer = &mut create_rebalancer(
            FakeRebalance {
                pos: &mut position,
                position_supply_ta_balance: None,
                position_debt_ta_balance: None,
                rebalance_direction: rebalance_direction.clone(),
            },
            rebalance_args,
            None,
        );

        let res = rebalancer.rebalance(RebalanceStep::PreSwap);
        assert!(res.is_ok());
        apply_actions(rebalancer);

        perform_swap(rebalancer, &rebalance_direction, true);

        let res = rebalancer.rebalance(RebalanceStep::PostSwap);
        assert!(res.is_ok());
        apply_actions(rebalancer);

        validate_rebalance(rebalancer);
    }
}
