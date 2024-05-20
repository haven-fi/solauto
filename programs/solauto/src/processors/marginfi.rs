use solana_program::{
    account_info::AccountInfo,
    clock::Clock,
    entrypoint::ProgramResult,
    sysvar::Sysvar,
};
use spl_token::state::Account as TokenAccount;

use crate::{
    instructions::{ open_position, protocol_interaction, rebalance, refresh },
    types::{
        instruction::{
            accounts::{
                MarginfiOpenPositionAccounts,
                MarginfiProtocolInteractionAccounts,
                MarginfiRebalanceAccounts,
                MarginfiRefreshDataAccounts,
            },
            RebalanceArgs,
            SolautoAction,
            SolautoStandardAccounts,
            UpdatePositionData,
        },
        shared::{ DeserializedAccount, LendingPlatform, ReferralStateAccount, SolautoPosition },
    },
    utils::*,
};

pub fn process_marginfi_open_position_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    position_data: UpdatePositionData,
    marignfi_acc_seed_idx: Option<u64>
) -> ProgramResult {
    let ctx = MarginfiOpenPositionAccounts::context(accounts)?;

    let solauto_position = solauto_utils::create_new_solauto_position(
        ctx.accounts.signer,
        ctx.accounts.solauto_position,
        position_data,
        LendingPlatform::Marginfi,
        ctx.accounts.supply_mint,
        ctx.accounts.debt_mint,
        ctx.accounts.marginfi_account,
        None,
        None
    )?;
    if solauto_position.data.position.is_some() {
        let position_data = solauto_position.data.position.as_ref().unwrap();
        let current_timestamp = Clock::get()?.unix_timestamp as u64;
        validation_utils::validate_position_settings(position_data, current_timestamp)?;
        validation_utils::validate_dca_settings(position_data, current_timestamp)?;
    }

    solauto_utils::init_solauto_fees_supply_ta(
        ctx.accounts.token_program,
        ctx.accounts.system_program,
        ctx.accounts.signer,
        ctx.accounts.solauto_fees_wallet,
        ctx.accounts.solauto_fees_supply_ta,
        ctx.accounts.supply_mint
    )?;

    if ctx.accounts.referred_by_state.is_some() && ctx.accounts.referred_by_supply_ta.is_some() {
        solana_utils::init_ata_if_needed(
            ctx.accounts.token_program,
            ctx.accounts.system_program,
            ctx.accounts.signer,
            ctx.accounts.referred_by_state.unwrap(),
            ctx.accounts.referred_by_supply_ta.unwrap(),
            ctx.accounts.supply_mint
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
        solauto_fees_supply_ta: DeserializedAccount::<TokenAccount>::unpack(
            Some(ctx.accounts.solauto_fees_supply_ta)
        )?,
        authority_referral_state: DeserializedAccount::<ReferralStateAccount>::deserialize(
            Some(ctx.accounts.signer_referral_state)
        )?,
        referred_by_state: ctx.accounts.referred_by_state,
        referred_by_supply_ta: DeserializedAccount::<TokenAccount>::unpack(
            ctx.accounts.referred_by_supply_ta
        )?,
    };
    validation_utils::generic_instruction_validation(
        &std_accounts,
        LendingPlatform::Marginfi,
        true,
        false
    )?;

    open_position::marginfi_open_position(ctx, std_accounts.solauto_position, marignfi_acc_seed_idx)
}

pub fn process_marginfi_refresh_data<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    let ctx = MarginfiRefreshDataAccounts::context(accounts)?;
    let solauto_position = DeserializedAccount::<SolautoPosition>::deserialize(
        ctx.accounts.solauto_position
    )?;

    if solauto_position.is_some() {
        validation_utils::validate_instruction(
            ctx.accounts.signer,
            solauto_position.as_ref().unwrap(),
            false,
            true
        )?;

        if ctx.accounts.marginfi_account.is_some() {
            validation_utils::validate_lending_program_accounts_with_position(
                solauto_position.as_ref().unwrap(),
                ctx.accounts.marginfi_account.unwrap(),
                Some(ctx.accounts.supply_bank),
                ctx.accounts.debt_bank
            )?;
        }
    }

    validation_utils::validate_lending_program_account(
        &ctx.accounts.marginfi_program,
        LendingPlatform::Marginfi
    )?;

    refresh::marginfi_refresh_accounts(ctx, solauto_position)
}

pub fn process_marginfi_interaction_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    action: SolautoAction
) -> ProgramResult {
    let ctx = MarginfiProtocolInteractionAccounts::context(accounts)?;
    let solauto_position = DeserializedAccount::<SolautoPosition>
        ::deserialize(Some(ctx.accounts.solauto_position))?
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
        false
    )?;

    protocol_interaction::marginfi_interaction(ctx, std_accounts, action)
}

pub fn process_marginfi_rebalance<'a>(
    accounts: &'a [AccountInfo<'a>],
    args: RebalanceArgs
) -> ProgramResult {
    let ctx = MarginfiRebalanceAccounts::context(accounts)?;
    let solauto_position = DeserializedAccount::<SolautoPosition>
        ::deserialize(Some(ctx.accounts.solauto_position))?
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
        solauto_fees_supply_ta: DeserializedAccount::<TokenAccount>::unpack(
            Some(ctx.accounts.solauto_fees_supply_ta)
        )?,
        authority_referral_state: DeserializedAccount::<ReferralStateAccount>::deserialize(
            Some(ctx.accounts.authority_referral_state)
        )?,
        referred_by_state: None,
        referred_by_supply_ta: DeserializedAccount::<TokenAccount>::unpack(
            ctx.accounts.referred_by_supply_ta
        )?,
    };
    validation_utils::generic_instruction_validation(
        &std_accounts,
        LendingPlatform::Marginfi,
        false,
        false
    )?;

    rebalance::marginfi_rebalance(ctx, std_accounts, args)
}
