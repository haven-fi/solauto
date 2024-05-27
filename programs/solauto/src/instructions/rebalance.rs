use std::ops::Sub;

use solana_program::{
    clock::Clock, entrypoint::ProgramResult, msg, program_error::ProgramError, sysvar::Sysvar,
};

use crate::{
    clients::{marginfi::MarginfiClient, solend::SolendClient},
    types::{
        instruction::{
            accounts::{Context, MarginfiRebalanceAccounts, SolendRebalanceAccounts},
            RebalanceData, SolautoStandardAccounts,
        },
        lending_protocol::LendingProtocolClient,
        shared::{DeserializedAccount, SolautoRebalanceStep},
        solauto_manager::{SolautoManager, SolautoManagerAccounts},
        solauto_position::SolautoPosition,
    },
    utils::{ix_utils, rebalance_utils},
};

use super::refresh;

pub fn marginfi_rebalance<'a, 'b>(
    ctx: Context<'a, MarginfiRebalanceAccounts<'a>>,
    mut std_accounts: SolautoStandardAccounts<'a>,
    args: RebalanceData,
) -> ProgramResult {
    let marginfi_client = MarginfiClient::from(
        ctx.accounts.signer,
        ctx.accounts.marginfi_program,
        ctx.accounts.marginfi_group,
        ctx.accounts.marginfi_account,
        ctx.accounts.supply_bank,
        Some(ctx.accounts.supply_price_oracle),
        Some(ctx.accounts.position_supply_ta),
        Some(ctx.accounts.vault_supply_ta),
        ctx.accounts.supply_vault_authority,
        ctx.accounts.debt_bank,
        Some(ctx.accounts.debt_price_oracle),
        Some(ctx.accounts.position_debt_ta),
        Some(ctx.accounts.vault_debt_ta),
        ctx.accounts.debt_vault_authority,
    )?;
    let solauto_manager_accounts = SolautoManagerAccounts::from(
        Some(ctx.accounts.position_supply_ta),
        Some(ctx.accounts.vault_supply_ta),
        Some(ctx.accounts.position_debt_ta),
        Some(ctx.accounts.vault_debt_ta),
        Some(ctx.accounts.intermediary_ta),
    )?;

    let solauto_rebalance_step = rebalance_utils::get_rebalance_step(&std_accounts)?;
    if needs_refresh(
        &std_accounts.solauto_position,
        &solauto_rebalance_step,
        &args,
    )? {
        refresh::marginfi_refresh_accounts(
            ctx.accounts.marginfi_program,
            ctx.accounts.marginfi_group,
            ctx.accounts.marginfi_account,
            ctx.accounts.supply_bank,
            ctx.accounts.supply_price_oracle,
            ctx.accounts.debt_bank,
            ctx.accounts.debt_price_oracle,
            &mut std_accounts.solauto_position,
        )?;
    }
    rebalance(
        marginfi_client,
        solauto_manager_accounts,
        std_accounts,
        solauto_rebalance_step,
        args,
    )
}

pub fn solend_rebalance<'a, 'b>(
    ctx: Context<'a, SolendRebalanceAccounts<'a>>,
    std_accounts: SolautoStandardAccounts<'a>,
    args: RebalanceData,
) -> ProgramResult {
    let solend_client = SolendClient::from(
        ctx.accounts.lending_market,
        ctx.accounts.obligation,
        ctx.accounts.supply_reserve,
        Some(ctx.accounts.supply_reserve_pyth_oracle),
        Some(ctx.accounts.supply_reserve_switchboard_oracle),
        Some(ctx.accounts.position_supply_liquidity_ta),
        Some(ctx.accounts.reserve_supply_liquidity_ta),
        Some(ctx.accounts.supply_collateral_mint),
        Some(ctx.accounts.position_supply_collateral_ta),
        Some(ctx.accounts.reserve_supply_collateral_ta),
        Some(ctx.accounts.debt_reserve),
        Some(ctx.accounts.debt_reserve_fee_receiver_ta),
        Some(ctx.accounts.position_debt_liquidity_ta),
        Some(ctx.accounts.reserve_debt_liquidity_ta),
    )?;
    let solauto_manager_accounts = SolautoManagerAccounts::from(
        Some(ctx.accounts.position_supply_liquidity_ta),
        Some(ctx.accounts.reserve_supply_liquidity_ta),
        Some(ctx.accounts.position_debt_liquidity_ta),
        Some(ctx.accounts.reserve_debt_liquidity_ta),
        Some(ctx.accounts.intermediary_ta),
    )?;

    let solauto_rebalance_step = rebalance_utils::get_rebalance_step(&std_accounts)?;
    // No need to check if a refresh is needed here because you cannot do any Solend interactions without having done a refresh instruction in the same transaction
    rebalance(
        solend_client,
        solauto_manager_accounts,
        std_accounts,
        solauto_rebalance_step,
        args,
    )
}

fn needs_refresh(
    solauto_position: &DeserializedAccount<SolautoPosition>,
    solauto_rebalance_step: &SolautoRebalanceStep,
    args: &RebalanceData,
) -> Result<bool, ProgramError> {
    if solauto_rebalance_step == &SolautoRebalanceStep::StartSolautoRebalanceSandwich
        || solauto_rebalance_step == &SolautoRebalanceStep::StartMarginfiFlashLoanSandwich
    {
        let current_timestamp = Clock::get()?.unix_timestamp as u64;
        let old_update =
            current_timestamp.sub(solauto_position.data.state.last_updated) > 60 * 60 * 12;
        let repaying = solauto_position.data.liq_utilization_rate_bps()
            > solauto_position.data.state.max_ltv_bps;
        let need_accurate_data = args.target_liq_utilization_rate_bps.is_some()
            && args.target_liq_utilization_rate_bps.unwrap() <= 500;

        if old_update || repaying || need_accurate_data {
            return Ok(true);
        }
    }
    Ok(false)
}

fn rebalance<'a, T: LendingProtocolClient<'a>>(
    client: T,
    solauto_manager_accounts: SolautoManagerAccounts<'a>,
    std_accounts: SolautoStandardAccounts<'a>,
    solauto_rebalance_step: SolautoRebalanceStep,
    args: RebalanceData,
) -> ProgramResult {
    if args.target_liq_utilization_rate_bps.is_some()
        && std_accounts.signer.key != &std_accounts.solauto_position.data.authority
    {
        msg!(
            "Cannot provide a target liquidation utilization rate if the instruction is not signed by the position authority"
        );
        return Err(ProgramError::InvalidInstructionData.into());
    }

    if args.max_price_slippage_bps.is_some() && args.max_price_slippage_bps.unwrap() > 2000 {
        msg!("Cannot provide a price slippage greater than 20%");
        return Err(ProgramError::InvalidInstructionData.into());
    }

    let mut solauto_manager =
        SolautoManager::from(&client, solauto_manager_accounts, std_accounts)?;
    solauto_manager.rebalance(args, solauto_rebalance_step)?;

    ix_utils::update_data(&mut solauto_manager.std_accounts.solauto_position)
}
