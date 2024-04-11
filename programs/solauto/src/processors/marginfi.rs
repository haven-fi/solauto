use solana_program::{ account_info::AccountInfo, entrypoint::ProgramResult };

use crate::{
    instructions::{ open_position, protocol_interaction, rebalance, refresh },
    types::{
        instruction::{
            accounts::{
                MarginfiOpenPositionAccounts, MarginfiProtocolInteractionAccounts, MarginfiRebalanceAccounts, MarginfiRefreshDataAccounts
            },
            OptionalLiqUtilizationRateBps,
            PositionData,
        },
        shared::{ DeserializedAccount, LendingPlatform, Position, SolautoAction },
    },
    utils::*,
};

use self::validation_utils::GenericInstructionValidation;

pub fn process_marginfi_open_position_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    position_data: Option<PositionData>
) -> ProgramResult {
    let ctx = MarginfiOpenPositionAccounts::context(accounts)?;
    let solauto_position = solauto_utils::create_new_solauto_position(
        ctx.accounts.signer,
        ctx.accounts.solauto_position,
        position_data,
        LendingPlatform::Marginfi
    )?;
    validation_utils::generic_instruction_validation(GenericInstructionValidation {
        signer: ctx.accounts.signer,
        authority_only_ix: true,
        solauto_position: &solauto_position,
        protocol_program: ctx.accounts.marginfi_program,
        lending_platform: LendingPlatform::Marginfi,
        solauto_admin_settings: None,
        fees_receiver_ata: None,
    })?;
    open_position::marginfi_open_position(ctx, solauto_position)
}

pub fn process_marginfi_refresh_data<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    let ctx = MarginfiRefreshDataAccounts::context(accounts)?;
    let solauto_position = DeserializedAccount::<Position>::deserialize(
        ctx.accounts.solauto_position
    )?;
    validation_utils::validate_program_account(
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
    let solauto_position = DeserializedAccount::<Position>::deserialize(
        ctx.accounts.solauto_position
    )?;
    validation_utils::generic_instruction_validation(GenericInstructionValidation {
        signer: ctx.accounts.signer,
        authority_only_ix: true,
        solauto_position: &solauto_position,
        protocol_program: ctx.accounts.marginfi_program,
        lending_platform: LendingPlatform::Marginfi,
        solauto_admin_settings: None,
        fees_receiver_ata: None,
    })?;
    validation_utils::validate_marginfi_protocol_interaction_ix(&ctx, &action)?;
    protocol_interaction::marginfi_interaction(ctx, solauto_position, action)
}

pub fn process_marginfi_rebalance<'a>(
    accounts: &'a [AccountInfo<'a>],
    target_liq_utilization_rate_bps: OptionalLiqUtilizationRateBps
) -> ProgramResult {
    let ctx = MarginfiRebalanceAccounts::context(accounts)?;
    let solauto_position = DeserializedAccount::<Position>::deserialize(
        ctx.accounts.solauto_position
    )?;
    validation_utils::generic_instruction_validation(GenericInstructionValidation {
        signer: ctx.accounts.signer,
        authority_only_ix: false,
        solauto_position: &solauto_position,
        protocol_program: ctx.accounts.marginfi_program,
        lending_platform: LendingPlatform::Marginfi,
        solauto_admin_settings: Some(ctx.accounts.solauto_admin_settings),
        fees_receiver_ata: Some(ctx.accounts.solauto_fees_receiver),
    })?;
    validation_utils::validate_rebalance_instruction(ctx.accounts.ix_sysvar)?;
    rebalance::marginfi_rebalance(ctx, solauto_position, target_liq_utilization_rate_bps)
}
