use marginfi_sdk::generated::accounts::MarginfiAccount;
use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, sysvar::Sysvar,
};

use crate::{
    clients::{marginfi::MarginfiClient, solend::SolendClient},
    types::{
        shared::DeserializedAccount, solauto_manager::SolautoManager,
        solauto_position::SolautoPosition,
    },
    utils::ix_utils,
};

// TODO: for client: avoid adding a refresh ix on a rebalance transaction if position has been last updated in the last 1 day
pub fn marginfi_refresh_accounts<'a, 'b>(
    marginfi_program: &'a AccountInfo<'a>,
    marginfi_group: &'a AccountInfo<'a>,
    marginfi_account: &'a AccountInfo<'a>,
    supply_bank: &'a AccountInfo<'a>,
    supply_price_oracle: &'a AccountInfo<'a>,
    debt_bank: &'a AccountInfo<'a>,
    debt_price_oracle: &'a AccountInfo<'a>,
    solauto_position: &'b mut DeserializedAccount<SolautoPosition>,
) -> ProgramResult {
    MarginfiClient::refresh_bank(marginfi_program, marginfi_group, supply_bank)?;

    MarginfiClient::refresh_bank(marginfi_program, marginfi_group, debt_bank)?;

    let marginfi_account =
        DeserializedAccount::<MarginfiAccount>::zerocopy(Some(marginfi_account))?.unwrap();

    let updated_state = MarginfiClient::get_updated_state(
        &marginfi_account,
        supply_bank,
        supply_price_oracle,
        debt_bank,
        debt_price_oracle,
    )?;

    SolautoManager::refresh_position(&mut solauto_position.data, updated_state, Clock::get()?);
    ix_utils::update_data(solauto_position)
}

pub fn solend_refresh_accounts<'a, 'b>(
    lending_market: &'a AccountInfo<'a>,
    obligation: &'a AccountInfo<'a>,
    supply_reserve: &'a AccountInfo<'a>,
    supply_reserve_pyth_oracle: &'a AccountInfo<'a>,
    supply_reserve_switchboard_oracle: &'a AccountInfo<'a>,
    debt_reserve: &'a AccountInfo<'a>,
    debt_reserve_pyth_oracle: &'a AccountInfo<'a>,
    debt_reserve_switchboard_oracle: &'a AccountInfo<'a>,
    solauto_position: &'b mut DeserializedAccount<SolautoPosition>,
) -> ProgramResult {
    SolendClient::refresh_reserve(
        supply_reserve,
        supply_reserve_pyth_oracle,
        supply_reserve_switchboard_oracle,
    )?;
    SolendClient::refresh_reserve(
        debt_reserve,
        debt_reserve_pyth_oracle,
        debt_reserve_switchboard_oracle,
    )?;

    let mut data_accounts = SolendClient::deserialize_solend_accounts(
        lending_market,
        Some(supply_reserve),
        Some(debt_reserve),
        obligation,
    )?;

    if data_accounts.obligation.data.deposits.len() > 0 {
        SolendClient::refresh_obligation(
            data_accounts.obligation.account_info,
            supply_reserve,
            Some(debt_reserve),
        )?;
    }

    let updated_state = SolendClient::get_updated_state(
        &mut data_accounts.lending_market.data,
        &data_accounts.supply_reserve.as_ref().unwrap().data,
        &data_accounts.debt_reserve.as_ref().unwrap().data,
        &data_accounts.obligation.data,
    )?;

    SolautoManager::refresh_position(&mut solauto_position.data, updated_state, Clock::get()?);
    ix_utils::update_data(solauto_position)
}
