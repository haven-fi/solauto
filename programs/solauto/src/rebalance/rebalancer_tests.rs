use solana_program::pubkey::Pubkey;
use spl_associated_token_account::get_associated_token_address;

use crate::{
    state::solauto_position::{ PositionData, PositionState, SolautoPosition },
    types::{
        instruction::RebalanceSettings,
        shared::{ PositionType, RefreshedTokenState },
        solauto::PositionValues,
    },
    utils::{ math_utils::to_base_unit, solauto_utils::{ update_token_state, SolautoFeesBps } },
};

use super::rebalancer::{ Rebalancer, RebalancerData, SolautoPositionData, TokenAccountData };

const TEST_TOKEN_DECIMALS: u8 = 9;

pub struct FakeRebalance {
    position_authority: Pubkey,
    pos: PositionValues,
    supply_mint: Pubkey,
    debt_mint: Pubkey,
    position_supply_ta_balance: Option<u64>,
    position_debt_ta_balance: Option<u64>,
    target_liq_utilization_rate_bps: Option<u16>,
}

fn create_rebalancer(
    data: FakeRebalance,
    rebalance_args: RebalanceSettings
) -> (SolautoPosition, Rebalancer) {
    let mut state = PositionState::default();

    update_token_state(
        &mut state.supply,
        &(RefreshedTokenState {
            amount_used: to_base_unit(data.pos.supply_usd / 100.0, TEST_TOKEN_DECIMALS),
            amount_can_be_used: 0,
            mint: data.supply_mint,
            decimals: TEST_TOKEN_DECIMALS,
            market_price: 100.0,
            borrow_fee_bps: Some(50),
        })
    );
    update_token_state(
        &mut state.supply,
        &(RefreshedTokenState {
            amount_used: to_base_unit::<f64, u8, u64>(data.pos.debt_usd, TEST_TOKEN_DECIMALS),
            amount_can_be_used: 0,
            mint: data.debt_mint,
            decimals: TEST_TOKEN_DECIMALS,
            market_price: 1.0,
            borrow_fee_bps: Some(50),
        })
    );

    let position = SolautoPosition::new(
        1,
        data.position_authority,
        PositionType::Leverage,
        PositionData::default(),
        state
    );
    let position_supply_ta = get_associated_token_address(&position.pubkey(), &data.supply_mint);
    let position_debt_ta = get_associated_token_address(&position.pubkey(), &data.debt_mint);
    let position_authority_supply_ta = get_associated_token_address(
        &data.position_authority,
        &data.supply_mint
    );
    let position_authority_debt_ta = get_associated_token_address(
        &data.position_authority,
        &data.debt_mint
    );
    let rebalancer = Rebalancer::new(RebalancerData {
        rebalance_args,
        solauto_position: SolautoPositionData {
            data: &mut Box::new(position),
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
        solauto_fees_bps: &SolautoFeesBps::from(
            false,
            data.target_liq_utilization_rate_bps,
            data.pos.supply_usd - data.pos.debt_usd
        ),
        referred_by_state: None,
        referred_by_ta: None,
    });

    (position, rebalancer)
}
