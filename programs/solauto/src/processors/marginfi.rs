use solana_program::{ account_info::AccountInfo, entrypoint::ProgramResult };

use crate::{
    instructions::{ open_position, protocol_interaction, refresh },
    types::{
        instruction::{
            accounts::{
                MarginfiOpenPositionAccounts, MarginfiProtocolInteractionAccounts, MarginfiRebalanceAccounts, MarginfiRefreshDataAccounts
            },
            OptionalUtilizationRateBps,
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
    let mut solauto_position = solauto_utils::create_new_solauto_position(
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
    open_position::marginfi_open_position(ctx, &mut solauto_position)?;
    ix_utils::update_data(&mut solauto_position)
}

pub fn process_marginfi_refresh_data<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    let ctx = MarginfiRefreshDataAccounts::context(accounts)?;
    let mut solauto_position = DeserializedAccount::<Position>::deserialize(
        ctx.accounts.solauto_position
    )?;
    validation_utils::validate_program_account(
        &ctx.accounts.marginfi_program,
        LendingPlatform::Marginfi
    )?;
    refresh::marginfi_refresh_accounts(ctx, &mut solauto_position)?;
    ix_utils::update_data(&mut solauto_position)
}

pub fn process_marginfi_interaction_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    action: SolautoAction
) -> ProgramResult {
    let ctx = MarginfiProtocolInteractionAccounts::context(accounts)?;
    let mut solauto_position = DeserializedAccount::<Position>::deserialize(
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
    protocol_interaction::marginfi_interaction(ctx, &mut solauto_position, action)?;
    ix_utils::update_data(&mut solauto_position)
}

pub fn process_marginfi_rebalance<'a>(
    accounts: &'a [AccountInfo<'a>],
    target_utilization_rate_bps: OptionalUtilizationRateBps
) -> ProgramResult {
    let ctx = MarginfiRebalanceAccounts::context(accounts)?;

    // TODO
    // 1. determine at what stage of the rebalance we are at, and take action accordingly
    //      - if deleveraging, we only need one rebalance, as there will be a flash borrow, token swap, and then this rebalance ix
    // 2. if on final stage, we should have funds in an intermediary token account
    //      - todo: figure out where we create this etc.
    // 3. if there is no other rebalance ix in this transaction and there are no funds in intermediary token account, throw error
    // 4. if there are 2 rebalance instructions and this is the first one, need to figure out the debt adjustment and move funds into intermediary token account
    
    Ok(())
}
