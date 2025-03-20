use std::ops::Sub;

use marginfi_sdk::generated::accounts::Bank;
use solana_program::{
    clock::Clock, entrypoint::ProgramResult, msg, program_error::ProgramError, pubkey::Pubkey,
    sysvar::Sysvar,
};

use crate::{
    clients::marginfi::MarginfiClient,
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
    utils::{ix_utils, solauto_utils},
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
    if rebalance_step == RebalanceStep::First
        || rebalance_type == SolautoRebalanceType::FLSwapThenRebalance
        || rebalance_type == SolautoRebalanceType::FLRebalanceThenSwap
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
            std_accounts
                .solauto_position
                .data
                .state
                .supply
                .update_market_price(MarginfiClient::load_price(
                    &DeserializedAccount::<Bank>::zerocopy(Some(ctx.accounts.supply_bank))?
                        .unwrap(),
                    ctx.accounts.supply_price_oracle.unwrap(),
                )?);
            std_accounts
                .solauto_position
                .data
                .state
                .debt
                .update_market_price(MarginfiClient::load_price(
                    &DeserializedAccount::<Bank>::zerocopy(Some(ctx.accounts.debt_bank))?.unwrap(),
                    ctx.accounts.debt_price_oracle.unwrap(),
                )?);
            std_accounts.solauto_position.data.refresh_state();
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
    if args.target_liq_utilization_rate_bps.is_some()
        && std_accounts.signer.key != &std_accounts.solauto_position.data.authority
    {
        msg!(
            "Cannot provide a target liquidation utilization rate if the instruction is not signed by the position authority"
        );
        return Err(ProgramError::InvalidInstructionData.into());
    }
    if std_accounts.authority_referral_state.is_none() {
        msg!(
            "Missing referral account when we rebalancing a position. Authority referral state is required"
        );
        return Err(SolautoError::IncorrectAccounts.into());
    }

    let fees_bps = solauto_utils::SolautoFeesBps::from(
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
    if rebalance_step == RebalanceStep::First {
        solauto_manager.begin_rebalance(&args)?;
    } else {
        solauto_manager.finish_rebalance(&args)?;
    }

    ix_utils::update_data(&mut solauto_manager.std_accounts.solauto_position)
}
