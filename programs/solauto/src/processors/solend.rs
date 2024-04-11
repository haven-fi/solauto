use solana_program::{ msg, account_info::AccountInfo, entrypoint::ProgramResult };

use crate::{
    instructions::*,
    types::{
        instruction::{
            accounts::{
                SolendOpenPositionAccounts,
                SolendProtocolInteractionAccounts,
                SolendRebalanceAccounts,
                SolendRefreshDataAccounts,
            },
            OptionalLiqUtilizationRateBps,
            PositionData,
        },
        shared::{ DeserializedAccount, LendingPlatform, Position, SolautoAction },
    },
    utils::*,
};

use self::validation_utils::GenericInstructionValidation;

pub fn process_solend_open_position_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    position_data: Option<PositionData>
) -> ProgramResult {
    // TODO
    msg!("Instruction is currently a WIP");

    let ctx = SolendOpenPositionAccounts::context(accounts)?;
    let solauto_position = solauto_utils::create_new_solauto_position(
        ctx.accounts.signer,
        ctx.accounts.solauto_position,
        position_data,
        LendingPlatform::Solend
    )?;
    validation_utils::generic_instruction_validation(GenericInstructionValidation {
        signer: ctx.accounts.signer,
        authority_only_ix: true,
        solauto_position: &solauto_position,
        protocol_program: ctx.accounts.solend_program,
        lending_platform: LendingPlatform::Solend,
        solauto_admin_settings: None,
        fees_receiver_ata: None,
    })?;
    open_position::solend_open_position(ctx, solauto_position)
}

pub fn process_solend_refresh_data<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    // TODO
    msg!("Instruction is currently a WIP");

    let ctx = SolendRefreshDataAccounts::context(accounts)?;
    let solauto_position = DeserializedAccount::<Position>::deserialize(
        ctx.accounts.solauto_position
    )?;
    validation_utils::validate_program_account(
        &ctx.accounts.solend_program,
        LendingPlatform::Solend
    )?;
    refresh::solend_refresh_accounts(ctx, solauto_position)
}

pub fn process_solend_interaction_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    action: SolautoAction
) -> ProgramResult {
    // TODO
    msg!("Instruction is currently a WIP");

    let ctx = SolendProtocolInteractionAccounts::context(accounts)?;
    let solauto_position = DeserializedAccount::<Position>::deserialize(
        ctx.accounts.solauto_position
    )?;
    validation_utils::generic_instruction_validation(GenericInstructionValidation {
        signer: ctx.accounts.signer,
        authority_only_ix: true,
        solauto_position: &solauto_position,
        protocol_program: ctx.accounts.solend_program,
        lending_platform: LendingPlatform::Solend,
        solauto_admin_settings: Some(ctx.accounts.solauto_admin_settings),
        fees_receiver_ata: Some(ctx.accounts.solauto_fees_receiver),
    })?;
    validation_utils::validate_solend_protocol_interaction_ix(&ctx, &action)?;
    protocol_interaction::solend_interaction(ctx, solauto_position, action)
}

pub fn process_solend_rebalance<'a>(
    accounts: &'a [AccountInfo<'a>],
    target_liq_utilization_rate_bps: OptionalLiqUtilizationRateBps
) -> ProgramResult {
    // TODO
    msg!("Instruction is currently a WIP");

    let ctx = SolendRebalanceAccounts::context(accounts)?;
    let solauto_position = DeserializedAccount::<Position>::deserialize(
        ctx.accounts.solauto_position
    )?;
    validation_utils::generic_instruction_validation(GenericInstructionValidation {
        signer: ctx.accounts.signer,
        authority_only_ix: false,
        solauto_position: &solauto_position,
        protocol_program: ctx.accounts.solend_program,
        lending_platform: LendingPlatform::Solend,
        solauto_admin_settings: Some(ctx.accounts.solauto_admin_settings),
        fees_receiver_ata: Some(ctx.accounts.solauto_fees_receiver),
    })?;
    validation_utils::validate_rebalance_instruction(ctx.accounts.ix_sysvar)?;
    rebalance::solend_rebalance(ctx, solauto_position, target_liq_utilization_rate_bps)
}
