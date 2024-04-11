use solana_program::entrypoint::ProgramResult;

use crate::{
    clients::solend::SolendClient,
    types::{
        instruction::accounts::{ Context, MarginfiRefreshDataAccounts, SolendRefreshDataAccounts },
        shared::{ DeserializedAccount, Position },
        solauto_manager::SolautoManager,
    },
};

pub fn marginfi_refresh_accounts(
    ctx: Context<MarginfiRefreshDataAccounts>,
    solauto_position: Option<DeserializedAccount<Position>>
) -> ProgramResult {
    // TODO
    Ok(())
}

pub fn solend_refresh_accounts(
    ctx: Context<SolendRefreshDataAccounts>,
    mut solauto_position: Option<DeserializedAccount<Position>>
) -> ProgramResult {
    SolendClient::refresh_reserve(
        ctx.accounts.supply_reserve,
        ctx.accounts.supply_reserve_pyth_price_oracle,
        ctx.accounts.supply_reserve_switchboard_oracle
    )?;
    if !ctx.accounts.debt_reserve.is_none() {
        SolendClient::refresh_reserve(
            ctx.accounts.debt_reserve.unwrap(),
            ctx.accounts.debt_reserve_pyth_price_oracle.unwrap(),
            ctx.accounts.debt_reserve_switchboard_oracle.unwrap()
        )?;
    }
    if !ctx.accounts.obligation.is_none() {
        let mut data_accounts = SolendClient::deserialize_solend_accounts(
            ctx.accounts.lending_market,
            Some(ctx.accounts.supply_reserve),
            ctx.accounts.debt_reserve,
            ctx.accounts.obligation.unwrap()
        )?;

        if data_accounts.obligation.data.deposits.len() > 0 {
            SolendClient::refresh_obligation(
                data_accounts.obligation.account_info,
                ctx.accounts.supply_reserve,
                ctx.accounts.debt_reserve
            )?;
        }

        if !ctx.accounts.solauto_position.is_none() {
            let obligation_position = SolendClient::get_obligation_position(
                &mut data_accounts.lending_market.data,
                data_accounts.supply_reserve.as_ref().map(|sr| &sr.data),
                data_accounts.debt_reserve.as_ref().map(|sr| &sr.data),
                &data_accounts.obligation.data
            )?;

            SolautoManager::refresh_position(&obligation_position, &mut solauto_position);
        }
    }

    Ok(())
}
