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
        shared::{ PositionType, RebalanceDirection, RefreshedTokenState },
        solauto::PositionValues,
    },
    utils::{
        math_utils::{ from_bps, get_liq_utilization_rate_bps, to_base_unit },
        solauto_utils::{ update_token_state, SolautoFeesBps },
    },
};

use super::rebalancer::{ Rebalancer, RebalancerData, SolautoPositionData, TokenAccountData };

const TEST_TOKEN_DECIMALS: u8 = 9;

pub struct FakePosition {
    position_authority: Pubkey,
    values: PositionValues,
    supply_mint: Pubkey,
    debt_mint: Pubkey,
    settings: SolautoSettingsParametersInp,
}

fn create_position(pos: &FakePosition) -> SolautoPosition {
    let mut state = PositionState::default();
    state.max_ltv_bps = 6400;
    state.liq_threshold_bps = 8181;
    state.liq_utilization_rate_bps = get_liq_utilization_rate_bps(
        pos.values.supply_usd,
        pos.values.debt_usd,
        from_bps(state.liq_threshold_bps)
    );

    update_token_state(
        &mut state.supply,
        &(RefreshedTokenState {
            amount_used: to_base_unit(pos.values.supply_usd / 100.0, TEST_TOKEN_DECIMALS),
            amount_can_be_used: 0,
            mint: pos.supply_mint,
            decimals: TEST_TOKEN_DECIMALS,
            market_price: 100.0,
            borrow_fee_bps: Some(50),
        })
    );
    update_token_state(
        &mut state.supply,
        &(RefreshedTokenState {
            amount_used: to_base_unit::<f64, u8, u64>(pos.values.debt_usd, TEST_TOKEN_DECIMALS),
            amount_can_be_used: 0,
            mint: pos.debt_mint,
            decimals: TEST_TOKEN_DECIMALS,
            market_price: 1.0,
            borrow_fee_bps: Some(50),
        })
    );

    let mut position_data = PositionData::default();
    position_data.setting_params = SolautoSettingsParameters::from(pos.settings);

    let position = SolautoPosition::new(
        1,
        pos.position_authority,
        PositionType::Leverage,
        position_data,
        state
    );

    position
}

pub struct FakeRebalance<'a> {
    pos: &'a mut Box<SolautoPosition>,
    position_supply_ta_balance: Option<u64>,
    position_debt_ta_balance: Option<u64>,
    target_liq_utilization_rate_bps: Option<u16>,
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
    let position_debt_ta = get_associated_token_address(&data.pos.pubkey(), &data.pos.state.debt.mint);
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
    let solauto_fees = SolautoFeesBps::from(
        false,
        data.target_liq_utilization_rate_bps,
        100.0
    );

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
        authority_supply_ta: position_authority_supply_ta,
        authority_debt_ta: position_authority_debt_ta,
        solauto_fees_bps: solauto_fees,
        referred_by_state: None,
        referred_by_ta: None,
        intermediary_ta: Pubkey::default(),
        solauto_fees_ta,
    });

    rebalancer
}
