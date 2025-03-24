use std::ops::{ Div, Mul };

use solana_program::pubkey::Pubkey;
use spl_associated_token_account::get_associated_token_address;

use crate::{
    constants::SOLAUTO_FEES_WALLET,
    state::solauto_position::{
        PositionData,
        PositionState,
        SolautoPosition,
        SolautoSettingsParameters,
        SolautoSettingsParametersInp,
    },
    types::{
        instruction::RebalanceSettings,
        shared::{ PositionType, RebalanceDirection, RefreshedTokenState, TokenBalanceAmount },
        solauto::{ PositionValues, SolautoCpiAction },
    },
    utils::{
        math_utils::{ from_base_unit, from_bps, get_liq_utilization_rate_bps, to_base_unit },
        solauto_utils::{ update_token_state, SolautoFeesBps },
    },
};

use super::rebalancer::{ Rebalancer, RebalancerData, SolautoPositionData, TokenAccountData };

const TEST_TOKEN_DECIMALS: u8 = 9;
const SOLAUTO_FEE_BPS: u16 = 50;
const BORROW_FEE_BPS: u16 = 50;
const SUPPLY_PRICE: f64 = 100.0;
const DEBT_PRICE: f64 = 1.0;

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
        from_bps(state.liq_threshold_bps)
    );

    update_token_state(
        &mut state.supply,
        &(RefreshedTokenState {
            amount_used: to_base_unit(pos.values.supply_usd / SUPPLY_PRICE, TEST_TOKEN_DECIMALS),
            amount_can_be_used: 0,
            mint: Pubkey::new_unique(),
            decimals: TEST_TOKEN_DECIMALS,
            market_price: SUPPLY_PRICE,
            borrow_fee_bps: Some(BORROW_FEE_BPS),
        })
    );
    update_token_state(
        &mut state.supply,
        &(RefreshedTokenState {
            amount_used: to_base_unit::<f64, u8, u64>(
                pos.values.debt_usd / DEBT_PRICE,
                TEST_TOKEN_DECIMALS
            ),
            amount_can_be_used: 0,
            mint: Pubkey::new_unique(),
            decimals: TEST_TOKEN_DECIMALS,
            market_price: DEBT_PRICE,
            borrow_fee_bps: Some(50),
        })
    );

    let mut position_data = PositionData::default();
    position_data.setting_params = SolautoSettingsParameters::from(pos.settings);

    let position = SolautoPosition::new(
        1,
        Pubkey::new_unique(),
        PositionType::Leverage,
        position_data,
        state
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
    rebalance_args: RebalanceSettings
) -> Rebalancer<'a> {
    let position_supply_ta = get_associated_token_address(
        &data.pos.pubkey(),
        &data.pos.state.supply.mint
    );
    let position_debt_ta = get_associated_token_address(
        &data.pos.pubkey(),
        &data.pos.state.debt.mint
    );
    let position_authority_supply_ta = get_associated_token_address(
        &data.pos.authority,
        &data.pos.state.supply.mint
    );
    let position_authority_debt_ta = get_associated_token_address(
        &data.pos.authority,
        &data.pos.state.debt.mint
    );

    let fees_mint = if data.rebalance_direction == RebalanceDirection::Boost {
        data.pos.state.supply.mint
    } else {
        data.pos.state.debt.mint
    };
    let solauto_fees_ta = get_associated_token_address(&SOLAUTO_FEES_WALLET, &fees_mint);
    let solauto_fees = SolautoFeesBps::from_mock(SOLAUTO_FEE_BPS);

    let rebalancer = Rebalancer::new(RebalancerData {
        rebalance_args,
        solauto_position: SolautoPositionData {
            data: data.pos,
            supply_ta: TokenAccountData {
                balance: data.position_supply_ta_balance.unwrap_or(0),
                pk: position_supply_ta,
            },
            debt_ta: TokenAccountData {
                balance: data.position_supply_ta_balance.unwrap_or(0),
                pk: position_debt_ta,
            },
        },
        authority_supply_ta: TokenAccountData::without_balance(position_authority_supply_ta),
        authority_debt_ta: TokenAccountData::without_balance(position_authority_debt_ta),
        solauto_fees_bps: solauto_fees,
        referred_by_state: None,
        referred_by_ta: None,
        intermediary_ta: TokenAccountData::without_balance(Pubkey::new_unique()),
        solauto_fees_ta,
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
    } else if ta_pk == rebalancer.data.authority_supply_ta.pk {
        credit_ta(&mut rebalancer.data.authority_supply_ta);
    } else if ta_pk == rebalancer.data.authority_debt_ta.pk {
        credit_ta(&mut rebalancer.data.authority_debt_ta);
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
                rebalancer.data.solauto_position.data.state.supply.update_usage(amount as i64);
                credit_token_account(
                    rebalancer,
                    rebalancer.data.solauto_position.supply_ta.pk,
                    (amount as i64) * -1
                );
            }
            SolautoCpiAction::Withdraw(data) => {
                let base_unit_amount = if let TokenBalanceAmount::Some(amount) = data.amount {
                    amount
                } else {
                    rebalancer.data.solauto_position.data.state.supply.amount_used.base_unit
                };
                println!("Withdraw {}", base_unit_amount);
                rebalancer.data.solauto_position.data.state.supply.update_usage(
                    (base_unit_amount as i64) * -1
                );
                credit_token_account(rebalancer, data.to_wallet_ta, base_unit_amount as i64);
            }
            SolautoCpiAction::Borrow(data) => {
                println!("Borrow {}", data.amount);
                rebalancer.data.solauto_position.data.state.debt.update_usage(data.amount as i64);
                credit_token_account(rebalancer, data.to_wallet_ta, data.amount as i64);
            }
            SolautoCpiAction::Repay(data) => {
                let base_unit_amount = if let TokenBalanceAmount::Some(amount) = data {
                    amount
                } else {
                    rebalancer.data.solauto_position.data.state.debt.amount_used.base_unit
                };
                println!("Repay {}", base_unit_amount);
                rebalancer.data.solauto_position.data.state.debt.update_usage(
                    (base_unit_amount as i64) * -1
                );
                credit_token_account(
                    rebalancer,
                    rebalancer.data.solauto_position.debt_ta.pk,
                    (base_unit_amount as i64) * -1
                );
            }
            SolautoCpiAction::SplTokenTransfer(args) => {
                println!("Transfer {}", args.amount);
                credit_token_account(rebalancer, args.from_wallet_ta, (args.amount as i64) * -1);
                credit_token_account(rebalancer, args.to_wallet_ta, args.amount as i64);
            }
        }
    }

    rebalancer.reset_actions();
}

fn perform_swap<'a>(rebalancer: &mut Rebalancer<'a>, rebalance_direction: &RebalanceDirection) {
    let (input_price, output_price) = if rebalance_direction == &RebalanceDirection::Boost {
        (DEBT_PRICE, SUPPLY_PRICE)
    } else {
        (SUPPLY_PRICE, DEBT_PRICE)
    };

    let swap_usd_value = from_base_unit::<u64, u8, f64>(
        rebalancer.data.intermediary_ta.balance,
        TEST_TOKEN_DECIMALS
    ).mul(input_price);

    println!("Swapping ${}", swap_usd_value);

    rebalancer.data.intermediary_ta.balance = 0;

    let output_amount = to_base_unit(
        swap_usd_value.div(output_price),
        TEST_TOKEN_DECIMALS
    );

    if rebalance_direction == &RebalanceDirection::Boost {
        credit_token_account(rebalancer, rebalancer.data.solauto_position.supply_ta.pk, output_amount);
    } else {
        credit_token_account(rebalancer, rebalancer.data.solauto_position.debt_ta.pk, output_amount);
    }

}

mod tests {
    use std::ops::Div;

    use crate::{
        types::{ shared::{ RebalanceStep, SolautoRebalanceType }, solauto::RebalanceFeesBps },
        utils::math_utils::{ get_debt_adjustment, get_max_repay_to_bps },
    };

    use super::*;

    #[test]
    fn test_standard_rebalance_boost() {
        let (max_ltv_bps, liq_threshold_bps) = (6400, 8181);
        let pos_values = PositionValues { supply_usd: 100.0, debt_usd: 25.0 };
        let rebalance_to = 3500;
        let mut position = create_position(
            &(FakePosition {
                values: &pos_values,
                settings: SolautoSettingsParametersInp {
                    boost_gap: 50,
                    boost_to_bps: rebalance_to,
                    repay_gap: 50,
                    repay_to_bps: get_max_repay_to_bps(max_ltv_bps, liq_threshold_bps),
                },
                max_ltv_bps: Some(max_ltv_bps),
                liq_threshold_bps: Some(liq_threshold_bps),
            })
        );

        let debt_adjustment = get_debt_adjustment(
            from_bps(liq_threshold_bps),
            &pos_values,
            &(RebalanceFeesBps {
                solauto: SOLAUTO_FEE_BPS,
                lp_borrow: BORROW_FEE_BPS,
                lp_flash_loan: 0,
            }),
            rebalance_to
        );

        let rebalance_direction = RebalanceDirection::Boost;
        let rebalancer = &mut create_rebalancer(
            FakeRebalance {
                pos: &mut position,
                position_supply_ta_balance: None,
                position_debt_ta_balance: None,
                rebalance_direction: rebalance_direction.clone(),
            },
            RebalanceSettings {
                rebalance_type: SolautoRebalanceType::Regular,
                target_liq_utilization_rate_bps: None,
                swap_in_amount_base_unit: to_base_unit::<f64, u8, u64>(
                    debt_adjustment.debt_adjustment_usd.div(DEBT_PRICE),
                    TEST_TOKEN_DECIMALS
                ),
                flash_loan_fee_bps: None,
            }
        );

        let res = rebalancer.rebalance(RebalanceStep::PreSwap);
        assert!(res.is_ok());
        apply_actions(rebalancer);

        perform_swap(rebalancer, &rebalance_direction);

        let res = rebalancer.rebalance(RebalanceStep::PostSwap);
        assert!(res.is_ok());
        apply_actions(rebalancer);

        assert!(rebalancer.validate_and_finalize_rebalance().is_ok());
    }

    #[test]
    fn test_standard_rebalance_repay() {}

    #[test]
    fn test_double_rebalance_fl_boost() {}

    #[test]
    fn test_double_rebalance_fl_repay() {}

    #[test]
    fn test_swap_then_rebalance_boost() {}

    #[test]
    fn test_swap_then_rebalance_repay() {}

    #[test]
    fn test_target_liq_utilization_rate_rebalance() {}
}
