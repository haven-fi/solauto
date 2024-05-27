use std::ops::Mul;

use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, msg,
    program_error::ProgramError, sysvar::Sysvar,
};
use spl_token::state::Account as TokenAccount;

use crate::{
    clients::marginfi::MarginfiClient,
    instructions::{open_position, protocol_interaction, rebalance, refresh},
    types::{
        instruction::{
            accounts::{
                MarginfiOpenPositionAccounts, MarginfiProtocolInteractionAccounts,
                MarginfiRebalanceAccounts, MarginfiRefreshDataAccounts,
            },
            MarginfiOpenPositionData, RebalanceData, SolautoAction, SolautoStandardAccounts,
        },
        shared::{DeserializedAccount, LendingPlatform, ReferralState},
        solauto_position::SolautoPosition,
    },
    utils::*,
};

pub fn process_marginfi_open_position_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    args: MarginfiOpenPositionData,
) -> ProgramResult {
    let ctx = MarginfiOpenPositionAccounts::context(accounts)?;

    let (max_ltv, liq_threshold) = if cfg!(feature = "test") {
        (0.8, 0.8)
    } else {
        validation_utils::validate_marginfi_bank(
            ctx.accounts.supply_bank,
            Some(ctx.accounts.supply_mint.key),
        )?;
        validation_utils::validate_marginfi_bank(
            ctx.accounts.debt_bank,
            Some(ctx.accounts.debt_mint.key),
        )?;
        let (max_ltv, liq_threshold) = MarginfiClient::get_max_ltv_and_liq_threshold(
            ctx.accounts.supply_bank,
            ctx.accounts.debt_bank,
        )?;

        (max_ltv, liq_threshold)
    };
    
    let solauto_position = solauto_utils::create_new_solauto_position(
        ctx.accounts.signer,
        ctx.accounts.solauto_position,
        args.position_data,
        LendingPlatform::Marginfi,
        ctx.accounts.supply_mint,
        ctx.accounts.debt_mint,
        ctx.accounts.marginfi_account,
        max_ltv,
        liq_threshold,
    )?;
    if solauto_position.data.position.is_some() {
        let current_timestamp = Clock::get()?.unix_timestamp as u64;
        validation_utils::validate_position_settings(&solauto_position.data, current_timestamp)?;
        validation_utils::validate_dca_settings(
            solauto_position.data.position.as_ref().unwrap(),
            current_timestamp,
        )?;
    }
    if solauto_position.data.self_managed && args.marginfi_account_seed_idx.is_some() {
        msg!("Provided a Marginfi account seed index on a self-managed index");
        return Err(ProgramError::InvalidInstructionData.into());
    }

    solauto_utils::init_solauto_fees_supply_ta(
        ctx.accounts.token_program,
        ctx.accounts.system_program,
        ctx.accounts.signer,
        ctx.accounts.solauto_fees_wallet,
        ctx.accounts.solauto_fees_supply_ta,
        ctx.accounts.supply_mint,
    )?;

    if ctx.accounts.referred_by_state.is_some() && ctx.accounts.referred_by_supply_ta.is_some() {
        solana_utils::init_ata_if_needed(
            ctx.accounts.token_program,
            ctx.accounts.system_program,
            ctx.accounts.signer,
            ctx.accounts.referred_by_state.unwrap(),
            ctx.accounts.referred_by_supply_ta.unwrap(),
            ctx.accounts.supply_mint,
        )?;
    }

    let std_accounts = SolautoStandardAccounts {
        signer: ctx.accounts.signer,
        lending_protocol: ctx.accounts.marginfi_program,
        system_program: ctx.accounts.system_program,
        token_program: ctx.accounts.token_program,
        ata_program: ctx.accounts.ata_program,
        rent: ctx.accounts.rent,
        ixs_sysvar: None,
        solauto_position,
        solauto_fees_supply_ta: DeserializedAccount::<TokenAccount>::unpack(Some(
            ctx.accounts.solauto_fees_supply_ta,
        ))?,
        authority_referral_state: DeserializedAccount::<ReferralState>::deserialize(Some(
            ctx.accounts.signer_referral_state,
        ))?,
        referred_by_state: ctx.accounts.referred_by_state,
        referred_by_supply_ta: DeserializedAccount::<TokenAccount>::unpack(
            ctx.accounts.referred_by_supply_ta,
        )?,
    };
    validation_utils::generic_instruction_validation(
        &std_accounts,
        LendingPlatform::Marginfi,
        true,
        false,
    )?;

    open_position::marginfi_open_position(
        ctx,
        std_accounts.solauto_position,
        args.marginfi_account_seed_idx,
    )
}

pub fn process_marginfi_refresh_data<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    let ctx = MarginfiRefreshDataAccounts::context(accounts)?;
    let mut solauto_position =
        DeserializedAccount::<SolautoPosition>::deserialize(Some(ctx.accounts.solauto_position))?
            .unwrap();

    validation_utils::validate_instruction(ctx.accounts.signer, &solauto_position, false, false)?;

    if !solauto_position.data.self_managed {
        validation_utils::validate_lending_program_accounts_with_position(
            LendingPlatform::Marginfi,
            &solauto_position,
            ctx.accounts.marginfi_account,
            Some(ctx.accounts.supply_bank),
            Some(ctx.accounts.debt_bank),
        )?;
    }

    validation_utils::validate_lending_program_account(
        &ctx.accounts.marginfi_program,
        LendingPlatform::Marginfi,
    )?;

    refresh::marginfi_refresh_accounts(
        ctx.accounts.marginfi_program,
        ctx.accounts.marginfi_group,
        ctx.accounts.marginfi_account,
        ctx.accounts.supply_bank,
        ctx.accounts.supply_price_oracle,
        ctx.accounts.debt_bank,
        ctx.accounts.debt_price_oracle,
        &mut solauto_position,
    )
}

pub fn process_marginfi_interaction_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    action: SolautoAction,
) -> ProgramResult {
    let ctx = MarginfiProtocolInteractionAccounts::context(accounts)?;
    let solauto_position =
        DeserializedAccount::<SolautoPosition>::deserialize(Some(ctx.accounts.solauto_position))?
            .unwrap();

    let std_accounts = SolautoStandardAccounts {
        signer: ctx.accounts.signer,
        lending_protocol: ctx.accounts.marginfi_program,
        system_program: ctx.accounts.system_program,
        token_program: ctx.accounts.token_program,
        ata_program: ctx.accounts.ata_program,
        rent: ctx.accounts.rent,
        ixs_sysvar: None,
        solauto_position,
        solauto_fees_supply_ta: None,
        authority_referral_state: None,
        referred_by_state: None,
        referred_by_supply_ta: None,
    };
    validation_utils::generic_instruction_validation(
        &std_accounts,
        LendingPlatform::Marginfi,
        true,
        false,
    )?;

    protocol_interaction::marginfi_interaction(ctx, std_accounts, action)
}

pub fn process_marginfi_rebalance<'a>(
    accounts: &'a [AccountInfo<'a>],
    args: RebalanceData,
) -> ProgramResult {
    let ctx = MarginfiRebalanceAccounts::context(accounts)?;
    let solauto_position =
        DeserializedAccount::<SolautoPosition>::deserialize(Some(ctx.accounts.solauto_position))?
            .unwrap();

    let std_accounts = SolautoStandardAccounts {
        signer: ctx.accounts.signer,
        lending_protocol: ctx.accounts.marginfi_program,
        system_program: ctx.accounts.system_program,
        token_program: ctx.accounts.token_program,
        ata_program: ctx.accounts.ata_program,
        rent: ctx.accounts.rent,
        ixs_sysvar: Some(ctx.accounts.ixs_sysvar),
        solauto_position,
        solauto_fees_supply_ta: DeserializedAccount::<TokenAccount>::unpack(Some(
            ctx.accounts.solauto_fees_supply_ta,
        ))?,
        authority_referral_state: DeserializedAccount::<ReferralState>::deserialize(Some(
            ctx.accounts.authority_referral_state,
        ))?,
        referred_by_state: None,
        referred_by_supply_ta: DeserializedAccount::<TokenAccount>::unpack(
            ctx.accounts.referred_by_supply_ta,
        )?,
    };
    validation_utils::generic_instruction_validation(
        &std_accounts,
        LendingPlatform::Marginfi,
        false,
        false,
    )?;

    rebalance::marginfi_rebalance(ctx, std_accounts, args)
}
