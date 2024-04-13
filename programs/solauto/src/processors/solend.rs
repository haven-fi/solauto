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
            PositionData,
            RebalanceArgs,
            SolautoStandardAccounts,
        },
        shared::{ DeserializedAccount, LendingPlatform, Position, RefferalState, SolautoAction },
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

    let authority_referral_state = solauto_utils::get_or_create_referral_state(
        ctx.accounts.system_program,
        ctx.accounts.token_program,
        ctx.accounts.rent,
        ctx.accounts.signer,
        ctx.accounts.signer,
        ctx.accounts.signer_referral_state,
        ctx.accounts.referral_fees_mint,
        ctx.accounts.signer_referral_fees_ta,
        ctx.accounts.referred_by_state,
        ctx.accounts.referred_by_ta
    )?;

    if !ctx.accounts.referred_by_state.is_none() {
        solauto_utils::get_or_create_referral_state(
            ctx.accounts.system_program,
            ctx.accounts.token_program,
            ctx.accounts.rent,
            ctx.accounts.signer,
            ctx.accounts.referred_by_authority.unwrap(),
            ctx.accounts.referred_by_state.unwrap(),
            ctx.accounts.referral_fees_mint,
            ctx.accounts.referred_by_ta.unwrap(),
            None,
            None
        )?;
    }

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
        authority_referral_state: Some(authority_referral_state),
        referred_by_ta: ctx.accounts.referred_by_ta,
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
        solauto_admin_settings: None,
        solauto_fees_receiver_ta: None,
        authority_referral_state: None,
        referred_by_ta: None,
    };
    validation_utils::generic_instruction_validation(&std_accounts, true, LendingPlatform::Solend)?;

    validation_utils::validate_solend_protocol_interaction_ix(&ctx, &action)?;
    protocol_interaction::solend_interaction(ctx, std_accounts, action)
}

pub fn process_solend_rebalance<'a>(
    accounts: &'a [AccountInfo<'a>],
    args: RebalanceArgs
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
        authority_referral_state: DeserializedAccount::<RefferalState>::deserialize(
            Some(ctx.accounts.authority_referral_state)
        )?,
        referred_by_ta: ctx.accounts.referred_by_ta,
    };
    validation_utils::generic_instruction_validation(
        &std_accounts,
        false,
        LendingPlatform::Solend
    )?;

    let solauto_rebalance_step = validation_utils::validate_rebalance_instruction(
        &std_accounts,
        &args
    )?;
    rebalance::solend_rebalance(ctx, std_accounts, args, solauto_rebalance_step)
}
