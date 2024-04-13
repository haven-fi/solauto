use solana_program::entrypoint::ProgramResult;

use crate::{
    clients::{ marginfi::MarginfiClient, solend::SolendClient },
    types::{
        instruction::{
            accounts::{ Context, MarginfiRebalanceAccounts, SolendRebalanceAccounts },
            RebalanceArgs,
            SolautoStandardAccounts,
        },
        lending_protocol::LendingProtocolClient,
        obligation_position::LendingProtocolObligationPosition,
        shared::SolautoError,
        solauto_manager::SolautoManager,
    },
    utils::{ ix_utils, validation_utils },
};

pub fn marginfi_rebalance<'a, 'b>(
    ctx: Context<'a, MarginfiRebalanceAccounts<'a>>,
    std_accounts: SolautoStandardAccounts<'a>,
    args: RebalanceArgs
) -> ProgramResult {
    let (marginfi_client, obligation_position) = MarginfiClient::from(ctx.accounts.signer)?;
    validation_utils::validate_rebalance_instruction(&std_accounts, &args, &obligation_position)?;
    rebalance(std_accounts, marginfi_client, obligation_position, args)
}

pub fn solend_rebalance<'a, 'b>(
    ctx: Context<'a, SolendRebalanceAccounts<'a>>,
    std_accounts: SolautoStandardAccounts<'a>,
    args: RebalanceArgs
) -> ProgramResult {
    let (solend_client, obligation_position) = SolendClient::from(
        ctx.accounts.lending_market,
        ctx.accounts.obligation,
        Some(ctx.accounts.supply_reserve),
        Some(ctx.accounts.supply_reserve_pyth_price_oracle),
        Some(ctx.accounts.supply_reserve_switchboard_oracle),
        Some(ctx.accounts.supply_liquidity_mint),
        Some(ctx.accounts.source_supply_liquidity_ta),
        Some(ctx.accounts.reserve_supply_liquidity_ta),
        Some(ctx.accounts.supply_collateral_mint),
        Some(ctx.accounts.source_supply_collateral_ta),
        Some(ctx.accounts.reserve_supply_collateral_ta),
        Some(ctx.accounts.debt_reserve),
        Some(ctx.accounts.debt_reserve_fee_receiver_ta),
        Some(ctx.accounts.debt_liquidity_mint),
        Some(ctx.accounts.source_debt_liquidity_ta),
        Some(ctx.accounts.reserve_debt_liquidity_ta)
    )?;
    validation_utils::validate_rebalance_instruction(&std_accounts, &args, &obligation_position)?;
    rebalance(std_accounts, solend_client, obligation_position, args)
}

fn rebalance<'a, T: LendingProtocolClient<'a>>(
    std_accounts: SolautoStandardAccounts<'a>,
    client: T,
    mut obligation_position: LendingProtocolObligationPosition,
    args: RebalanceArgs
) -> ProgramResult {
    let target_liq_utilization_rate: Result<u16, SolautoError> = if
        !args.target_liq_utilization_rate_bps.is_none()
    {
        Ok(args.target_liq_utilization_rate_bps.unwrap())
    } else {
        let setting_params = &std_accounts.solauto_position.as_ref().unwrap().data.setting_params;
        let current_utilization_rate = obligation_position.current_liq_utilization_rate_bps();
        if current_utilization_rate < setting_params.boost_from_bps {
            Ok(setting_params.boost_to_bps)
        } else if current_utilization_rate > setting_params.repay_from_bps {
            Ok(setting_params.repay_to_bps)
        } else {
            return Err(SolautoError::InvalidRebalanceCondition.into());
        }
    };

    let mut solauto_manager = SolautoManager::from(
        &client,
        &mut obligation_position,
        std_accounts
    )?;

    solauto_manager.rebalance(target_liq_utilization_rate.unwrap())?;

    SolautoManager::refresh_position(
        &solauto_manager.obligation_position,
        &mut solauto_manager.std_accounts.solauto_position
    );
    ix_utils::update_data(&mut solauto_manager.std_accounts.solauto_position)
}
