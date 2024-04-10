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
    Ok(())
}


// increasing leverage:
// -
// if debt + debt adjustment keeps utilization rate under 90%, instructions are:
// solauto rebalance - borrows more debt (figure out what to do with solauto fee after borrow)
// jup swap - swap debt token to supply token
// solauto rebalance - deposit supply token
// -
// if debt + debt adjustment brings utilization rate above 95%, instructions are:
// take out flash loan in debt token
// jup swap - swap debt token to supply token
// solauto rebalance - deposit supply token, borrow equivalent debt token amount from flash borrow ix + flash loan fee
// repay flash loan in debt token

// deleveraging:
// -
// if supply - debt adjustment keeps utilization rate under 95%, instructions are:
// solauto rebalance - withdraw supply worth debt_adjustment_usd
// jup swap - swap supply token to debt token
// solauto rebalance - repay debt with debt token
// -
// if supply - debt adjustment brings utilization rate over 95%, instructions are:
// take out flash loan in supply token
// jup swap - swap supply token to debt token
// solauto rebalance - repay debt token, & withdraw equivalent supply token amount from flash borrow ix + flash loan fee
// repay flash loan in supply token

// 1. figure out what the state will look like in each rebalance instruction
// 2. figure out what validations we need for each case
// 3. figure out where and when we create intermediary token accounts. Should we create and close on the fly?