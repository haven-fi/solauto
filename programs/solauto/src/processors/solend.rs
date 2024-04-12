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
            SolautoStandardAccounts,
        },
        shared::{ DeserializedAccount, LendingPlatform, Position, SolautoAction },
    },
    utils::*,
};

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
    let std_accounts = SolautoStandardAccounts {
        signer: ctx.accounts.signer,
        lending_protocol: ctx.accounts.solend_program,
        system_program: ctx.accounts.system_program,
        token_program: ctx.accounts.token_program,
        ata_program: ctx.accounts.ata_program,
        ixs_sysvar: None,
        solauto_position,
        solauto_admin_settings: None,
        solauto_fees_receiver_ta: None,
    };
    validation_utils::generic_instruction_validation(&std_accounts, true, LendingPlatform::Solend)?;
    open_position::solend_open_position(ctx, std_accounts.solauto_position)
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
    let std_accounts = SolautoStandardAccounts {
        signer: ctx.accounts.signer,
        lending_protocol: ctx.accounts.solend_program,
        system_program: ctx.accounts.system_program,
        token_program: ctx.accounts.token_program,
        ata_program: ctx.accounts.ata_program,
        ixs_sysvar: None,
        solauto_position,
        solauto_admin_settings: Some(ctx.accounts.solauto_admin_settings),
        solauto_fees_receiver_ta: Some(ctx.accounts.solauto_fees_receiver_ta),
    };
    validation_utils::generic_instruction_validation(&std_accounts, true, LendingPlatform::Solend)?;
    validation_utils::validate_solend_protocol_interaction_ix(&ctx, &action)?;
    protocol_interaction::solend_interaction(ctx, std_accounts, action)
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
    let std_accounts = SolautoStandardAccounts {
        signer: ctx.accounts.signer,
        lending_protocol: ctx.accounts.solend_program,
        system_program: ctx.accounts.system_program,
        token_program: ctx.accounts.token_program,
        ata_program: ctx.accounts.ata_program,
        ixs_sysvar: Some(ctx.accounts.ixs_sysvar),
        solauto_position,
        solauto_admin_settings: Some(ctx.accounts.solauto_admin_settings),
        solauto_fees_receiver_ta: Some(ctx.accounts.solauto_fees_receiver_ta),
    };
    validation_utils::generic_instruction_validation(&std_accounts, false, LendingPlatform::Solend)?;
    rebalance::solend_rebalance(ctx, std_accounts, target_liq_utilization_rate_bps)
}
