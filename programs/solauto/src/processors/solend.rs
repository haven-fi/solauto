use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult, msg};
use spl_token::state::Account as TokenAccount;

use crate::{
    instructions::*,
    types::{
        instruction::{
            accounts::{
                SolendOpenPositionAccounts, SolendProtocolInteractionAccounts,
                SolendRebalanceAccounts, SolendRefreshDataAccounts,
            },
            RebalanceArgs, SolautoAction, SolautoStandardAccounts, UpdatePositionData,
        },
        shared::{DeserializedAccount, LendingPlatform, PositionAccount, ReferralStateAccount},
    },
    utils::*,
};

pub fn process_solend_open_position_instruction<'a>(
    accounts: &'a [AccountInfo<'a>],
    position_data: UpdatePositionData,
) -> ProgramResult {
    // TODO
    msg!("Instruction is currently a WIP");

    let ctx = SolendOpenPositionAccounts::context(accounts)?;

    validation_utils::validate_dca_settings(&position_data.active_dca)?;
    let solauto_position = solauto_utils::create_new_solauto_position(
        ctx.accounts.signer,
        ctx.accounts.solauto_position,
        position_data,
        LendingPlatform::Solend,
        ctx.accounts.supply_liquidity_mint,
        ctx.accounts.debt_liquidity_mint,
        ctx.accounts.obligation,
    )?;

    solauto_utils::init_solauto_fees_supply_ta(
        ctx.accounts.token_program,
        ctx.accounts.system_program,
        ctx.accounts.signer,
        ctx.accounts.solauto_fees_wallet,
        ctx.accounts.solauto_fees_supply_ta,
        ctx.accounts.supply_liquidity_mint,
    )?;

    if ctx.accounts.referred_by_state.is_some() && ctx.accounts.referred_by_supply_ta.is_some() {
        solana_utils::init_ata_if_needed(
            ctx.accounts.token_program,
            ctx.accounts.system_program,
            ctx.accounts.signer,
            ctx.accounts.referred_by_state.unwrap(),
            ctx.accounts.referred_by_supply_ta.unwrap(),
            ctx.accounts.supply_liquidity_mint,
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
        solauto_fees_supply_ta: DeserializedAccount::<TokenAccount>::unpack(Some(
            ctx.accounts.solauto_fees_supply_ta,
        ))?,
        authority_referral_state: DeserializedAccount::<ReferralStateAccount>::deserialize(Some(
            ctx.accounts.signer_referral_state,
        ))?,
        referred_by_state: ctx.accounts.referred_by_state,
        referred_by_supply_ta: DeserializedAccount::<TokenAccount>::unpack(
            ctx.accounts.referred_by_supply_ta,
        )?,
    };
    validation_utils::generic_instruction_validation(&std_accounts, true, LendingPlatform::Solend)?;

    open_position::solend_open_position(ctx, std_accounts.solauto_position)
}

pub fn process_solend_refresh_data<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    // TODO
    msg!("Instruction is currently a WIP");

    let ctx = SolendRefreshDataAccounts::context(accounts)?;
    let solauto_position =
        DeserializedAccount::<PositionAccount>::deserialize(ctx.accounts.solauto_position)?;
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
        DeserializedAccount::<PositionAccount>::deserialize(Some(ctx.accounts.solauto_position))?
            .unwrap();

    let std_accounts = SolautoStandardAccounts {
        signer: ctx.accounts.signer,
        lending_protocol: ctx.accounts.solend_program,
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
    validation_utils::generic_instruction_validation(&std_accounts, true, LendingPlatform::Solend)?;

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
        DeserializedAccount::<PositionAccount>::deserialize(Some(ctx.accounts.solauto_position))?
            .unwrap();

    let std_accounts = SolautoStandardAccounts {
        signer: ctx.accounts.signer,
        lending_protocol: ctx.accounts.solend_program,
        system_program: ctx.accounts.system_program,
        token_program: ctx.accounts.token_program,
        ata_program: ctx.accounts.ata_program,
        rent: ctx.accounts.rent,
        ixs_sysvar: Some(ctx.accounts.ixs_sysvar),
        solauto_position,
        solauto_fees_supply_ta: DeserializedAccount::<TokenAccount>::unpack(Some(
            ctx.accounts.solauto_fees_supply_ta,
        ))?,
        authority_referral_state: DeserializedAccount::<ReferralStateAccount>::deserialize(Some(
            ctx.accounts.authority_referral_state,
        ))?,
        referred_by_state: None,
        referred_by_supply_ta: DeserializedAccount::<TokenAccount>::unpack(
            ctx.accounts.referred_by_supply_ta,
        )?,
    };
    validation_utils::generic_instruction_validation(
        &std_accounts,
        false,
        LendingPlatform::Solend,
    )?;

    rebalance::solend_rebalance(ctx, std_accounts, args)
}
