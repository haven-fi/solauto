use solana_program::entrypoint::ProgramResult;

use crate::{
    clients::{marginfi::MarginfiClient, solend::SolendClient},
    types::{
        instruction::{
            accounts::{Context, MarginfiRebalanceAccounts, SolendRebalanceAccounts},
            RebalanceArgs, SolautoStandardAccounts,
        },
        lending_protocol::LendingProtocolClient,
        obligation_position::LendingProtocolObligationPosition,
        solauto_manager::{SolautoManager, SolautoManagerAccounts},
    },
    utils::{ix_utils, solauto_utils},
};

pub fn marginfi_rebalance<'a, 'b>(
    ctx: Context<'a, MarginfiRebalanceAccounts<'a>>,
    std_accounts: SolautoStandardAccounts<'a>,
    args: RebalanceArgs,
) -> ProgramResult {
    let (marginfi_client, obligation_position) = MarginfiClient::from(ctx.accounts.signer)?;
    let solauto_manager_accounts = SolautoManagerAccounts::from(
        Some(ctx.accounts.supply_mint),
        Some(ctx.accounts.position_supply_ta),
        Some(ctx.accounts.bank_supply_ta),
        Some(ctx.accounts.debt_mint),
        Some(ctx.accounts.position_debt_ta),
        Some(ctx.accounts.bank_debt_ta),
        Some(ctx.accounts.intermediary_ta),
    )?;
    rebalance(
        marginfi_client,
        obligation_position,
        solauto_manager_accounts,
        std_accounts,
        args,
    )
}

pub fn solend_rebalance<'a, 'b>(
    ctx: Context<'a, SolendRebalanceAccounts<'a>>,
    std_accounts: SolautoStandardAccounts<'a>,
    args: RebalanceArgs,
) -> ProgramResult {
    let (solend_client, obligation_position) = SolendClient::from(
        ctx.accounts.lending_market,
        ctx.accounts.obligation,
        Some(ctx.accounts.supply_reserve),
        Some(ctx.accounts.supply_reserve_pyth_price_oracle),
        Some(ctx.accounts.supply_reserve_switchboard_oracle),
        Some(ctx.accounts.supply_liquidity_mint),
        Some(ctx.accounts.position_supply_liquidity_ta),
        Some(ctx.accounts.reserve_supply_liquidity_ta),
        Some(ctx.accounts.supply_collateral_mint),
        Some(ctx.accounts.position_supply_collateral_ta),
        Some(ctx.accounts.reserve_supply_collateral_ta),
        Some(ctx.accounts.debt_reserve),
        Some(ctx.accounts.debt_reserve_fee_receiver_ta),
        Some(ctx.accounts.debt_liquidity_mint),
        Some(ctx.accounts.position_debt_liquidity_ta),
        Some(ctx.accounts.reserve_debt_liquidity_ta),
    )?;
    let solauto_manager_accounts = SolautoManagerAccounts::from(
        Some(ctx.accounts.supply_liquidity_mint),
        Some(ctx.accounts.position_supply_liquidity_ta),
        Some(ctx.accounts.reserve_supply_liquidity_ta),
        Some(ctx.accounts.debt_liquidity_mint),
        Some(ctx.accounts.position_debt_liquidity_ta),
        Some(ctx.accounts.reserve_debt_liquidity_ta),
        Some(ctx.accounts.intermediary_ta),
    )?;
    rebalance(
        solend_client,
        obligation_position,
        solauto_manager_accounts,
        std_accounts,
        args,
    )
}

fn rebalance<'a, T: LendingProtocolClient<'a>>(
    client: T,
    mut obligation_position: LendingProtocolObligationPosition,
    solauto_manager_accounts: SolautoManagerAccounts<'a>,
    std_accounts: SolautoStandardAccounts<'a>,
    args: RebalanceArgs,
) -> ProgramResult {
    let solauto_rebalance_step = solauto_utils::get_rebalance_step(&std_accounts, &args)?;

    let mut solauto_manager = SolautoManager::from(
        &client,
        &mut obligation_position,
        solauto_manager_accounts,
        std_accounts,
    )?;
    solauto_manager.rebalance(args, solauto_rebalance_step)?;

    SolautoManager::refresh_position(
        &solauto_manager.obligation_position,
        &mut solauto_manager.std_accounts.solauto_position,
        None,
        None,
    )?;
    ix_utils::update_data(&mut solauto_manager.std_accounts.solauto_position)
}
