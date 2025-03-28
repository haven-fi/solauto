use std::ops::Sub;

use marginfi_sdk::generated::accounts::Bank;
use solana_program::{
    clock::Clock, entrypoint::ProgramResult, program_error::ProgramError, pubkey::Pubkey,
    sysvar::Sysvar,
};

use crate::{
    check,
    clients::marginfi::MarginfiClient,
    rebalance::solauto_fees::SolautoFeesBps,
    state::solauto_position::SolautoPosition,
    types::{
        errors::SolautoError,
        instruction::{
            accounts::{Context, MarginfiRebalanceAccounts},
            RebalanceSettings, SolautoStandardAccounts,
        },
        lending_protocol::{LendingProtocolClient, LendingProtocolTokenAccounts},
        shared::{DeserializedAccount, RebalanceStep, SolautoRebalanceType},
        solauto_manager::{SolautoManager, SolautoManagerAccounts},
    },
    utils::ix_utils,
};

use super::refresh;

pub fn marginfi_rebalance<'a>(
    ctx: Context<'a, MarginfiRebalanceAccounts<'a>>,
    mut std_accounts: Box<SolautoStandardAccounts<'a>>,
    rebalance_step: RebalanceStep,
    args: RebalanceSettings,
) -> ProgramResult {
    let supply_tas = LendingProtocolTokenAccounts::from(
        None,
        Some(ctx.accounts.position_supply_ta),
        ctx.accounts.authority_supply_ta,
        ctx.accounts.vault_supply_ta,
    )?;
    let debt_tas = LendingProtocolTokenAccounts::from(
        None,
        Some(ctx.accounts.position_debt_ta),
        ctx.accounts.authority_debt_ta,
        ctx.accounts.vault_debt_ta,
    )?;

    let marginfi_client = Box::new(MarginfiClient::from(
        ctx.accounts.signer,
        ctx.accounts.marginfi_program,
        ctx.accounts.marginfi_group,
        ctx.accounts.marginfi_account,
        ctx.accounts.supply_bank,
        ctx.accounts.supply_price_oracle,
        supply_tas.clone(),
        ctx.accounts.supply_vault_authority,
        ctx.accounts.debt_bank,
        ctx.accounts.debt_price_oracle,
        debt_tas.clone(),
        ctx.accounts.debt_vault_authority,
    )?);
    let solauto_manager_accounts =
        SolautoManagerAccounts::from(supply_tas, debt_tas, ctx.accounts.intermediary_ta, None)?;

    let rebalance_type = std_accounts
        .solauto_position
        .data
        .rebalance
        .ixs
        .rebalance_type;
    if rebalance_step == RebalanceStep::PreSwap
        || rebalance_type == SolautoRebalanceType::FLSwapThenRebalance
    {
        if needs_refresh(&std_accounts.solauto_position, &args)? {
            refresh::marginfi_refresh_accounts(
                ctx.accounts.marginfi_program,
                ctx.accounts.marginfi_group,
                ctx.accounts.marginfi_account,
                ctx.accounts.supply_bank,
                ctx.accounts.supply_price_oracle.unwrap(),
                ctx.accounts.debt_bank,
                ctx.accounts.debt_price_oracle.unwrap(),
                &mut std_accounts.solauto_position,
            )?;
        } else {
            let supply_price = MarginfiClient::load_price(
                &DeserializedAccount::<Bank>::zerocopy(Some(ctx.accounts.supply_bank))?.unwrap(),
                ctx.accounts.supply_price_oracle.unwrap(),
            )?;
            let debt_price = MarginfiClient::load_price(
                &DeserializedAccount::<Bank>::zerocopy(Some(ctx.accounts.debt_bank))?.unwrap(),
                ctx.accounts.debt_price_oracle.unwrap(),
            )?;
            update_token_prices(&mut std_accounts, supply_price, debt_price);
        }
    }

    rebalance(
        marginfi_client,
        solauto_manager_accounts,
        std_accounts,
        rebalance_step,
        args,
    )
}

fn update_token_prices<'a>(
    std_accounts: &mut Box<SolautoStandardAccounts<'a>>,
    supply_price: f64,
    debt_price: f64,
) {
    std_accounts
        .solauto_position
        .data
        .state
        .supply
        .update_market_price(supply_price);
    std_accounts
        .solauto_position
        .data
        .state
        .debt
        .update_market_price(debt_price);
    std_accounts.solauto_position.data.refresh_state();
}

fn needs_refresh(
    solauto_position: &DeserializedAccount<SolautoPosition>,
    args: &RebalanceSettings,
) -> Result<bool, ProgramError> {
    if solauto_position.data.self_managed.val {
        return Ok(true);
    }

    let current_timestamp = Clock::get()?.unix_timestamp as u64;

    // In case we did a refresh recently
    if current_timestamp.sub(solauto_position.data.state.last_updated) <= 2 {
        return Ok(false);
    }

    if args.target_liq_utilization_rate_bps.is_some()
        && args.target_liq_utilization_rate_bps.unwrap() == 0
    {
        return Ok(true);
    }

    Ok(false)
}

fn rebalance<'a>(
    client: Box<dyn LendingProtocolClient<'a> + 'a>,
    solauto_manager_accounts: SolautoManagerAccounts<'a>,
    std_accounts: Box<SolautoStandardAccounts<'a>>,
    rebalance_step: RebalanceStep,
    args: RebalanceSettings,
) -> ProgramResult {
    check!(
        args.target_liq_utilization_rate_bps.is_none()
            || std_accounts.signer.key == &std_accounts.solauto_position.data.authority,
        SolautoError::NonAuthorityProvidedTargetLTV
    );
    check!(
        std_accounts.authority_referral_state.is_some(),
        SolautoError::IncorrectAccounts
    );
    check!(
        args.flash_loan_fee_bps.unwrap_or(0) <= 150,
        SolautoError::IncorrectInstructions
    );

    let fees_bps = SolautoFeesBps::from(
        std_accounts
            .authority_referral_state
            .as_ref()
            .unwrap()
            .data
            .referred_by_state
            != Pubkey::default(),
        args.target_liq_utilization_rate_bps,
        std_accounts
            .solauto_position
            .data
            .state
            .net_worth
            .usd_value(),
    );

    let mut solauto_manager = SolautoManager::from(
        client,
        solauto_manager_accounts,
        std_accounts,
        Some(fees_bps),
    )?;
    solauto_manager.rebalance(args, rebalance_step)?;

    ix_utils::update_data(&mut solauto_manager.std_accounts.solauto_position)
}
