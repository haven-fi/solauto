use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult};

use crate::{
    instructions::{open_position, protocol_interaction, rebalance, refresh},
    types::{
        instruction::{
            accounts::{
                MarginfiOpenPositionAccounts, MarginfiProtocolInteractionAccounts,
                MarginfiRebalanceAccounts, MarginfiRefreshDataAccounts,
            },
            RebalanceArgs, SolautoAction, SolautoStandardAccounts, UpdatePositionData,
        },
        shared::{DeserializedAccount, LendingPlatform, Position, RefferalState},
    },
    utils::*,
};

pub fn process_marginfi_open_position_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    position_data: UpdatePositionData,
) -> ProgramResult {
    let ctx = MarginfiOpenPositionAccounts::context(accounts)?;
    let solauto_position = solauto_utils::create_new_solauto_position(
        ctx.accounts.signer,
        ctx.accounts.solauto_position,
        position_data,
        LendingPlatform::Marginfi,
    )?;

    solauto_utils::init_solauto_fees_supply_ta(
        ctx.accounts.token_program,
        ctx.accounts.system_program,
        ctx.accounts.rent,
        ctx.accounts.signer,
        ctx.accounts.solauto_fees_wallet,
        ctx.accounts.solauto_fees_supply_ta,
        ctx.accounts.supply_mint,
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

        solana_utils::init_ata_if_needed(
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
        lending_protocol: ctx.accounts.marginfi_program,
        system_program: ctx.accounts.system_program,
        token_program: ctx.accounts.token_program,
        ata_program: ctx.accounts.ata_program,
        rent: ctx.accounts.rent,
        ixs_sysvar: None,
        solauto_position,
        solauto_fees_supply_ta: Some(ctx.accounts.solauto_fees_supply_ta),
        authority_referral_state: Some(authority_referral_state),
        referred_by_state: ctx.accounts.referred_by_state,
        referred_by_supply_ta: ctx.accounts.referred_by_supply_ta,
    };
    validation_utils::generic_instruction_validation(
        &std_accounts,
        true,
        LendingPlatform::Marginfi,
        Some(ctx.accounts.supply_mint),
    )?;

    open_position::marginfi_open_position(ctx, std_accounts.solauto_position)
}

pub fn process_marginfi_refresh_data<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    let ctx = MarginfiRefreshDataAccounts::context(accounts)?;
    let solauto_position =
        DeserializedAccount::<Position>::deserialize(ctx.accounts.solauto_position)?;
    validation_utils::validate_program_account(
        &ctx.accounts.marginfi_program,
        LendingPlatform::Marginfi,
    )?;
    refresh::marginfi_refresh_accounts(ctx, solauto_position)
}

pub fn process_marginfi_interaction_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    action: SolautoAction,
) -> ProgramResult {
    let ctx = MarginfiProtocolInteractionAccounts::context(accounts)?;
    let solauto_position =
        DeserializedAccount::<Position>::deserialize(Some(ctx.accounts.solauto_position))?.unwrap();

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
        true,
        LendingPlatform::Marginfi,
        ctx.accounts.supply_mint,
    )?;

    validation_utils::validate_marginfi_protocol_interaction_ix(&ctx, &action)?;
    protocol_interaction::marginfi_interaction(ctx, std_accounts, action)
}

pub fn process_marginfi_rebalance<'a>(
    accounts: &'a [AccountInfo<'a>],
    args: RebalanceArgs,
) -> ProgramResult {
    let ctx = MarginfiRebalanceAccounts::context(accounts)?;
    let solauto_position =
        DeserializedAccount::<Position>::deserialize(Some(ctx.accounts.solauto_position))?.unwrap();

    let std_accounts = SolautoStandardAccounts {
        signer: ctx.accounts.signer,
        lending_protocol: ctx.accounts.marginfi_program,
        system_program: ctx.accounts.system_program,
        token_program: ctx.accounts.token_program,
        ata_program: ctx.accounts.ata_program,
        rent: ctx.accounts.rent,
        ixs_sysvar: Some(ctx.accounts.ixs_sysvar),
        solauto_position,
        solauto_fees_supply_ta: Some(ctx.accounts.solauto_fees_supply_ta),
        authority_referral_state: DeserializedAccount::<RefferalState>::deserialize(Some(
            ctx.accounts.authority_referral_state,
        ))?,
        referred_by_state: ctx.accounts.referred_by_state,
        referred_by_supply_ta: ctx.accounts.referred_by_supply_ta,
    };
    validation_utils::generic_instruction_validation(
        &std_accounts,
        false,
        LendingPlatform::Marginfi,
        Some(ctx.accounts.supply_mint),
    )?;

    rebalance::marginfi_rebalance(ctx, std_accounts, args)
}
