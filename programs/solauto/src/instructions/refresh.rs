use marginfi_sdk::generated::accounts::MarginfiAccount;
use solana_program::entrypoint::ProgramResult;

use crate::{
    clients::{marginfi::MarginfiClient, solend::SolendClient},
    types::{
        instruction::accounts::{Context, MarginfiRefreshDataAccounts, SolendRefreshDataAccounts},
        shared::{DeserializedAccount, SolautoPosition},
        solauto_manager::SolautoManager,
    },
    utils::ix_utils,
};

// TODO: for client: avoid adding a refresh ix on a rebalance transaction if position has been last updated in the last 1 day
pub fn marginfi_refresh_accounts(
    ctx: Context<MarginfiRefreshDataAccounts>,
    mut solauto_position: Option<DeserializedAccount<SolautoPosition>>,
) -> ProgramResult {
    MarginfiClient::refresh_bank(
        ctx.accounts.marginfi_program,
        ctx.accounts.marginfi_group,
        ctx.accounts.supply_bank,
    )?;

    if ctx.accounts.debt_bank.is_some() {
        MarginfiClient::refresh_bank(
            ctx.accounts.marginfi_program,
            ctx.accounts.marginfi_group,
            ctx.accounts.debt_bank.unwrap(),
        )?;
    }

    if ctx.accounts.solauto_position.is_some()
        && !solauto_position.as_ref().unwrap().data.self_managed
    {
        let marginfi_account = DeserializedAccount::<MarginfiAccount>::deserialize(ctx.accounts.marginfi_account)?.unwrap();

        let obligation_position = MarginfiClient::get_obligation_position(
            &marginfi_account,
            ctx.accounts.supply_bank,
            ctx.accounts.supply_price_oracle,
            ctx.accounts.debt_bank,
            ctx.accounts.debt_price_oracle,
        )?;

        SolautoManager::refresh_position(&obligation_position, solauto_position.as_mut().unwrap())?;
    }

    if solauto_position.is_some() {
        ix_utils::update_data(solauto_position.as_mut().unwrap())?;
    }

    Ok(())
}

pub fn solend_refresh_accounts(
    ctx: Context<SolendRefreshDataAccounts>,
    mut solauto_position: Option<DeserializedAccount<SolautoPosition>>,
) -> ProgramResult {
    SolendClient::refresh_reserve(
        ctx.accounts.supply_reserve,
        ctx.accounts.supply_reserve_pyth_price_oracle,
        ctx.accounts.supply_reserve_switchboard_oracle,
    )?;
    if ctx.accounts.debt_reserve.is_some() {
        SolendClient::refresh_reserve(
            ctx.accounts.debt_reserve.unwrap(),
            ctx.accounts.debt_reserve_pyth_price_oracle.unwrap(),
            ctx.accounts.debt_reserve_switchboard_oracle.unwrap(),
        )?;
    }
    if ctx.accounts.obligation.is_some() {
        let mut data_accounts = SolendClient::deserialize_solend_accounts(
            ctx.accounts.lending_market,
            Some(ctx.accounts.supply_reserve),
            ctx.accounts.debt_reserve,
            ctx.accounts.obligation.unwrap(),
        )?;

        if data_accounts.obligation.data.deposits.len() > 0 {
            SolendClient::refresh_obligation(
                data_accounts.obligation.account_info,
                ctx.accounts.supply_reserve,
                ctx.accounts.debt_reserve,
            )?;
        }

        if solauto_position.is_some() && !solauto_position.as_ref().unwrap().data.self_managed {
            let obligation_position = SolendClient::get_obligation_position(
                &mut data_accounts.lending_market.data,
                &data_accounts.supply_reserve.as_ref().unwrap().data,
                data_accounts.debt_reserve.as_ref().map(|sr| &sr.data),
                &data_accounts.obligation.data,
            )?;

            SolautoManager::refresh_position(
                &obligation_position,
                solauto_position.as_mut().unwrap(),
            )?;
        }
    }

    if solauto_position.is_some() {
        ix_utils::update_data(&mut solauto_position.as_mut().unwrap())?;
    }

    Ok(())
}
