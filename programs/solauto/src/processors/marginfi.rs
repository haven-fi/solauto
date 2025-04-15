use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, msg, sysvar::Sysvar,
};

use crate::{
    check,
    clients::marginfi::MarginfiClient,
    instructions::{open_position, protocol_interaction, rebalance, refresh},
    rebalance::utils::set_rebalance_ixs_data,
    state::{referral_state::ReferralState, solauto_position::SolautoPosition},
    types::{
        errors::SolautoError,
        instruction::{
            accounts::{
                MarginfiOpenPositionAccounts, MarginfiProtocolInteractionAccounts,
                MarginfiRebalanceAccounts, MarginfiRefreshDataAccounts,
            },
            MarginfiOpenPositionData, RebalanceSettings, SolautoAction, SolautoStandardAccounts,
        },
        shared::{DeserializedAccount, LendingPlatform, PriceType},
    },
    utils::*,
};

pub fn process_marginfi_open_position_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    args: MarginfiOpenPositionData,
) -> ProgramResult {
    msg!("Instruction: Marginfi open position");
    let ctx = MarginfiOpenPositionAccounts::context(accounts)?;

    let (max_ltv, liq_threshold) = if cfg!(feature = "local") {
        (0.65, 0.8)
    } else {
        let (max_ltv, liq_threshold) = MarginfiClient::get_max_ltv_and_liq_threshold(
            ctx.accounts.supply_bank,
            ctx.accounts.debt_bank,
        )?;
        (max_ltv, liq_threshold)
    };

    let solauto_position = solauto_utils::create_new_solauto_position(
        ctx.accounts.signer,
        ctx.accounts.solauto_position,
        args.position_type,
        args.position_data,
        LendingPlatform::Marginfi,
        ctx.accounts.supply_mint,
        ctx.accounts.supply_bank,
        ctx.accounts.debt_mint,
        ctx.accounts.debt_bank,
        ctx.accounts.marginfi_account,
        ctx.accounts.marginfi_group,
        max_ltv,
        liq_threshold,
    )?;
    if !solauto_position.data.self_managed.val {
        let current_timestamp = Clock::get()?.unix_timestamp as u64;
        validation_utils::validate_position_settings(&solauto_position.data)?;
        // validation_utils::validate_dca_settings(
        //     &solauto_position.data.position,
        //     current_timestamp,
        // )?;
    }

    if ctx.accounts.referred_by_supply_ta.is_some() {
        solana_utils::init_ata_if_needed(
            ctx.accounts.token_program,
            ctx.accounts.system_program,
            ctx.accounts.signer,
            ctx.accounts.referred_by_state.unwrap(),
            ctx.accounts.referred_by_supply_ta.unwrap(),
            ctx.accounts.supply_mint,
        )?;
    }

    if !cfg!(feature = "local") {
        validation_utils::validate_lending_program_accounts_with_position(
            LendingPlatform::Marginfi,
            &solauto_position,
            ctx.accounts.marginfi_account,
            ctx.accounts.supply_bank,
            ctx.accounts.debt_bank,
        )?;
    }

    let std_accounts = Box::new(SolautoStandardAccounts {
        signer: ctx.accounts.signer,
        lending_protocol: ctx.accounts.marginfi_program,
        system_program: ctx.accounts.system_program,
        token_program: ctx.accounts.token_program,
        ata_program: Some(ctx.accounts.ata_program),
        rent: Some(ctx.accounts.rent),
        ixs_sysvar: None,
        solauto_position,
        solauto_fees_ta: None,
        authority_referral_state: DeserializedAccount::<ReferralState>::zerocopy(Some(
            ctx.accounts.signer_referral_state,
        ))?,
        referred_by_ta: ctx.accounts.referred_by_supply_ta,
    });
    validation_utils::generic_instruction_validation(
        &std_accounts,
        LendingPlatform::Marginfi,
        true,
        false,
    )?;

    open_position::marginfi_open_position(ctx, std_accounts.solauto_position)
}

pub fn process_marginfi_refresh_data<'a>(
    accounts: &'a [AccountInfo<'a>],
    price_type: PriceType,
) -> ProgramResult {
    msg!("Instruction: Marginfi refresh data");
    let ctx = MarginfiRefreshDataAccounts::context(accounts)?;
    let mut solauto_position =
        DeserializedAccount::<SolautoPosition>::zerocopy(Some(ctx.accounts.solauto_position))?
            .unwrap();

    validation_utils::validate_instruction(ctx.accounts.signer, &solauto_position, false, false)?;

    if !solauto_position.data.self_managed.val {
        validation_utils::validate_lending_program_accounts_with_position(
            LendingPlatform::Marginfi,
            &solauto_position,
            ctx.accounts.marginfi_account,
            ctx.accounts.supply_bank,
            ctx.accounts.debt_bank,
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
        price_type,
    )
}

pub fn process_marginfi_interaction_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    action: SolautoAction,
) -> ProgramResult {
    msg!("Instruction: Marginfi protocol interaction");
    let ctx = MarginfiProtocolInteractionAccounts::context(accounts)?;
    let solauto_position =
        DeserializedAccount::<SolautoPosition>::zerocopy(Some(ctx.accounts.solauto_position))?
            .unwrap();

    let std_accounts = Box::new(SolautoStandardAccounts {
        signer: ctx.accounts.signer,
        lending_protocol: ctx.accounts.marginfi_program,
        system_program: ctx.accounts.system_program,
        token_program: ctx.accounts.token_program,
        ata_program: Some(ctx.accounts.ata_program),
        rent: Some(ctx.accounts.rent),
        ixs_sysvar: None,
        solauto_position,
        solauto_fees_ta: None,
        authority_referral_state: None,
        referred_by_ta: None,
    });
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
    args: RebalanceSettings,
) -> ProgramResult {
    msg!("Instruction: Marginfi rebalance");
    let ctx = MarginfiRebalanceAccounts::context(accounts)?;
    let solauto_position =
        DeserializedAccount::<SolautoPosition>::zerocopy(Some(ctx.accounts.solauto_position))?
            .unwrap();

    let mut std_accounts = Box::new(SolautoStandardAccounts {
        signer: ctx.accounts.signer,
        lending_protocol: ctx.accounts.marginfi_program,
        system_program: ctx.accounts.system_program,
        token_program: ctx.accounts.token_program,
        ata_program: None,
        rent: None,
        ixs_sysvar: Some(ctx.accounts.ixs_sysvar),
        solauto_position,
        solauto_fees_ta: ctx.accounts.solauto_fees_ta,
        authority_referral_state: DeserializedAccount::<ReferralState>::zerocopy(Some(
            ctx.accounts.authority_referral_state,
        ))?,
        referred_by_ta: ctx.accounts.referred_by_ta,
    });
    validation_utils::generic_instruction_validation(
        &std_accounts,
        LendingPlatform::Marginfi,
        false,
        false,
    )?;

    // TODO: position_authority for later when we want to handle withdrawing from position during rebalances
    check!(
        ctx.accounts.position_authority.is_none()
            || &std_accounts.solauto_position.data.authority
                == ctx.accounts.position_authority.unwrap().key,
        SolautoError::IncorrectAccounts
    );

    let rebalance_step = set_rebalance_ixs_data(&mut std_accounts, &args)?;

    rebalance::marginfi_rebalance(ctx, std_accounts, rebalance_step, args)
}
