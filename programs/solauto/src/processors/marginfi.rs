use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult};
use spl_token::state::Account as TokenAccount;

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
        shared::{DeserializedAccount, LendingPlatform, ReferralStateAccount, SolautoPosition},
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
        ctx.accounts.supply_mint,
        ctx.accounts.debt_mint,
        ctx.accounts.marginfi_account,
    )?;
    if solauto_position.data.position.is_some() {
        validation_utils::validate_dca_settings(solauto_position.data.position.as_ref().unwrap())?;
    }

    solauto_utils::init_solauto_fees_supply_ta(
        ctx.accounts.token_program,
        ctx.accounts.system_program,
        ctx.accounts.signer,
        ctx.accounts.solauto_fees_wallet,
        ctx.accounts.solauto_fees_supply_ta,
        ctx.accounts.supply_mint,
    )?;

    if ctx.accounts.referred_by_state.is_some() && ctx.accounts.referred_by_supply_ta.is_some() {
        solana_utils::init_ata_if_needed(
            ctx.accounts.token_program,
            ctx.accounts.system_program,
            ctx.accounts.signer,
            ctx.accounts.referred_by_state.unwrap(),
            ctx.accounts.referred_by_supply_ta.unwrap(),
            ctx.accounts.supply_mint,
            false,
            None,
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
    validation_utils::generic_instruction_validation(
        &std_accounts,
        true,
        LendingPlatform::Marginfi,
    )?;

    open_position::marginfi_open_position(ctx, std_accounts.solauto_position)
}

pub fn process_marginfi_refresh_data<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    let ctx = MarginfiRefreshDataAccounts::context(accounts)?;
    let solauto_position =
        DeserializedAccount::<SolautoPosition>::deserialize(ctx.accounts.solauto_position)?;
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
        DeserializedAccount::<SolautoPosition>::deserialize(Some(ctx.accounts.solauto_position))?
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
        true,
        LendingPlatform::Marginfi,
    )?;

    protocol_interaction::marginfi_interaction(ctx, std_accounts, action)
}

pub fn process_marginfi_rebalance<'a>(
    accounts: &'a [AccountInfo<'a>],
    args: RebalanceArgs,
) -> ProgramResult {
    let ctx = MarginfiRebalanceAccounts::context(accounts)?;
    let solauto_position =
        DeserializedAccount::<SolautoPosition>::deserialize(Some(ctx.accounts.solauto_position))?
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
        LendingPlatform::Marginfi,
    )?;

    rebalance::marginfi_rebalance(ctx, std_accounts, args)
}
