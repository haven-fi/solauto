use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult, msg};

use crate::{
    constants::SOLAUTO_FEES_RECEIVER_WALLET,
    instructions::*,
    types::{
        instruction::{
            accounts::{
                SolendOpenPositionAccounts, SolendProtocolInteractionAccounts,
                SolendRebalanceAccounts, SolendRefreshDataAccounts,
            },
            RebalanceArgs, SolautoAction, SolautoStandardAccounts, UpdatePositionData,
        },
        shared::{DeserializedAccount, LendingPlatform, Position, RefferalState, SolautoError},
    },
    utils::{solana_utils::init_ata_if_needed, *},
};

pub fn process_solend_open_position_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    position_data: UpdatePositionData,
) -> ProgramResult {
    // TODO
    msg!("Instruction is currently a WIP");

    let ctx = SolendOpenPositionAccounts::context(accounts)?;
    let solauto_position = solauto_utils::create_new_solauto_position(
        ctx.accounts.signer,
        ctx.accounts.solauto_position,
        position_data,
        LendingPlatform::Solend,
    )?;

    if ctx.accounts.solauto_fees_receiver.key != &SOLAUTO_FEES_RECEIVER_WALLET {
        return Err(SolautoError::IncorrectFeesReceiverAccount.into());
    }
    init_ata_if_needed(
        ctx.accounts.token_program,
        ctx.accounts.system_program,
        ctx.accounts.rent,
        ctx.accounts.signer,
        ctx.accounts.solauto_fees_receiver,
        ctx.accounts.solauto_fees_receiver_ta,
        ctx.accounts.supply_liquidity_mint,
    )?;

    let authority_referral_state = solauto_utils::get_or_create_referral_state(
        ctx.accounts.system_program,
        ctx.accounts.token_program,
        ctx.accounts.rent,
        ctx.accounts.signer,
        ctx.accounts.signer,
        ctx.accounts.signer_referral_state,
        ctx.accounts.referral_fees_mint,
        ctx.accounts.signer_referral_dest_ta,
        ctx.accounts.referred_by_state,
        ctx.accounts.referred_by_dest_ta,
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
            ctx.accounts.referred_by_dest_ta.unwrap(),
            None,
            None,
        )?;

        init_ata_if_needed(
            ctx.accounts.token_program,
            ctx.accounts.system_program,
            ctx.accounts.rent,
            ctx.accounts.signer,
            ctx.accounts.referred_by_state.unwrap(),
            ctx.accounts.referred_by_supply_ta.unwrap(),
            ctx.accounts.referral_fees_mint,
        )?;
    }

    let std_accounts = SolautoStandardAccounts {
        signer: ctx.accounts.signer,
        lending_protocol: ctx.accounts.solend_program,
        system_program: ctx.accounts.system_program,
        token_program: ctx.accounts.token_program,
        ata_program: ctx.accounts.ata_program,
        rent: ctx.accounts.rent,
        ixs_sysvar: None,
        solauto_position,
        solauto_fees_receiver_ta: Some(ctx.accounts.solauto_fees_receiver_ta),
        authority_referral_state: Some(authority_referral_state),
        referred_by_state: ctx.accounts.referred_by_state,
        referred_by_supply_ta: ctx.accounts.referred_by_supply_ta,
    };
    validation_utils::generic_instruction_validation(
        &std_accounts,
        true,
        LendingPlatform::Solend,
        Some(ctx.accounts.supply_liquidity_mint),
    )?;

    open_position::solend_open_position(ctx, std_accounts.solauto_position)
}

pub fn process_solend_refresh_data<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    // TODO
    msg!("Instruction is currently a WIP");

    let ctx = SolendRefreshDataAccounts::context(accounts)?;
    let solauto_position =
        DeserializedAccount::<Position>::deserialize(ctx.accounts.solauto_position)?;
    validation_utils::validate_program_account(
        &ctx.accounts.solend_program,
        LendingPlatform::Solend,
    )?;
    refresh::solend_refresh_accounts(ctx, solauto_position)
}

pub fn process_solend_interaction_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    action: SolautoAction,
) -> ProgramResult {
    // TODO
    msg!("Instruction is currently a WIP");

    let ctx = SolendProtocolInteractionAccounts::context(accounts)?;
    let solauto_position =
        DeserializedAccount::<Position>::deserialize(Some(ctx.accounts.solauto_position))?.unwrap();

    let std_accounts = SolautoStandardAccounts {
        signer: ctx.accounts.signer,
        lending_protocol: ctx.accounts.solend_program,
        system_program: ctx.accounts.system_program,
        token_program: ctx.accounts.token_program,
        ata_program: ctx.accounts.ata_program,
        rent: ctx.accounts.rent,
        ixs_sysvar: None,
        solauto_position,
        solauto_fees_receiver_ta: None,
        authority_referral_state: None,
        referred_by_state: None,
        referred_by_supply_ta: None,
    };
    validation_utils::generic_instruction_validation(
        &std_accounts,
        true,
        LendingPlatform::Solend,
        ctx.accounts.supply_liquidity_mint,
    )?;

    validation_utils::validate_solend_protocol_interaction_ix(&ctx, &action)?;
    protocol_interaction::solend_interaction(ctx, std_accounts, action)
}

pub fn process_solend_rebalance<'a>(
    accounts: &'a [AccountInfo<'a>],
    args: RebalanceArgs,
) -> ProgramResult {
    // TODO
    msg!("Instruction is currently a WIP");

    let ctx = SolendRebalanceAccounts::context(accounts)?;
    let solauto_position =
        DeserializedAccount::<Position>::deserialize(Some(ctx.accounts.solauto_position))?.unwrap();

    let std_accounts = SolautoStandardAccounts {
        signer: ctx.accounts.signer,
        lending_protocol: ctx.accounts.solend_program,
        system_program: ctx.accounts.system_program,
        token_program: ctx.accounts.token_program,
        ata_program: ctx.accounts.ata_program,
        rent: ctx.accounts.rent,
        ixs_sysvar: Some(ctx.accounts.ixs_sysvar),
        solauto_position,
        solauto_fees_receiver_ta: Some(ctx.accounts.solauto_fees_receiver_ta),
        authority_referral_state: DeserializedAccount::<RefferalState>::deserialize(Some(
            ctx.accounts.authority_referral_state,
        ))?,
        referred_by_state: ctx.accounts.referred_by_state,
        referred_by_supply_ta: ctx.accounts.referred_by_supply_ta,
    };
    validation_utils::generic_instruction_validation(
        &std_accounts,
        false,
        LendingPlatform::Solend,
        Some(ctx.accounts.supply_liquidity_mint),
    )?;

    rebalance::solend_rebalance(ctx, std_accounts, args)
}
