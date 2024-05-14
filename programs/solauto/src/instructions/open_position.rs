use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_pack::Pack,
};
use solend_sdk::state::Obligation;

use crate::{
    clients::{marginfi::MarginfiClient, solend::SolendClient},
    types::{
        instruction::accounts::{
            Context, MarginfiOpenPositionAccounts, SolendOpenPositionAccounts,
        },
        shared::{DeserializedAccount, SolautoPosition},
    },
    utils::*,
};

use self::solana_utils::account_has_data;

pub fn marginfi_open_position<'a>(
    ctx: Context<'a, MarginfiOpenPositionAccounts<'a>>,
    mut solauto_position: DeserializedAccount<'a, SolautoPosition>,
) -> ProgramResult {
    initialize_solauto_position(
        &mut solauto_position,
        ctx.accounts.system_program,
        ctx.accounts.token_program,
        ctx.accounts.rent,
        ctx.accounts.signer,
        ctx.accounts.position_supply_ta,
        ctx.accounts.supply_mint,
        ctx.accounts.position_debt_ta,
        ctx.accounts.signer_debt_ta,
        ctx.accounts.debt_mint,
    )?;

    MarginfiClient::initialize(&ctx, &solauto_position)
}

pub fn solend_open_position<'a>(
    ctx: Context<'a, SolendOpenPositionAccounts<'a>>,
    mut solauto_position: DeserializedAccount<'a, SolautoPosition>,
) -> ProgramResult {
    initialize_solauto_position(
        &mut solauto_position,
        ctx.accounts.system_program,
        ctx.accounts.token_program,
        ctx.accounts.rent,
        ctx.accounts.signer,
        ctx.accounts.position_supply_liquidity_ta,
        ctx.accounts.supply_liquidity_mint,
        ctx.accounts.position_debt_liquidity_ta,
        ctx.accounts.signer_debt_liquidity_ta,
        ctx.accounts.debt_liquidity_mint,
    )?;

    solana_utils::init_ata_if_needed(
        ctx.accounts.token_program,
        ctx.accounts.system_program,
        ctx.accounts.signer,
        solauto_position.account_info,
        ctx.accounts.position_supply_collateral_ta,
        ctx.accounts.supply_collateral_mint,
    )?;

    let obligation_seeds = if !solauto_position.data.self_managed {
        vec![
            solauto_position.account_info.key.as_ref(),
            ctx.accounts.signer.key.as_ref(),
            ctx.accounts.lending_market.key.as_ref(),
            ctx.accounts.solend_program.key.as_ref(),
        ]
    } else {
        vec![
            ctx.accounts.signer.key.as_ref(),
            ctx.accounts.lending_market.key.as_ref(),
            ctx.accounts.solend_program.key.as_ref(),
        ]
    };

    if !account_has_data(ctx.accounts.obligation) {
        solana_utils::init_account(
            ctx.accounts.system_program,
            ctx.accounts.rent,
            ctx.accounts.signer,
            ctx.accounts.obligation,
            ctx.accounts.solend_program.key,
            Some(obligation_seeds),
            Obligation::LEN,
        )?;
    }

    SolendClient::initialize(&ctx, &solauto_position)
}

fn initialize_solauto_position<'a, 'b>(
    solauto_position: &'b mut DeserializedAccount<'a, SolautoPosition>,
    system_program: &'a AccountInfo<'a>,
    token_program: &'a AccountInfo<'a>,
    rent: &'a AccountInfo<'a>,
    signer: &'a AccountInfo<'a>,
    position_supply_ta: &'a AccountInfo<'a>,
    supply_mint: &'a AccountInfo<'a>,
    position_debt_ta: Option<&'a AccountInfo<'a>>,
    signer_debt_ta: Option<&'a AccountInfo<'a>>,
    debt_mint: Option<&'a AccountInfo<'a>>,
) -> ProgramResult {
    if !solauto_position.data.self_managed || !account_has_data(solauto_position.account_info) {
        solana_utils::init_account(
            system_program,
            rent,
            signer,
            solauto_position.account_info,
            &crate::ID,
            Some(solauto_position.data.seeds()),
            SolautoPosition::LEN,
        )?;
    }

    solana_utils::init_ata_if_needed(
        token_program,
        system_program,
        signer,
        solauto_position.account_info,
        position_supply_ta,
        supply_mint,
    )?;

    if debt_mint.is_some() {
        solana_utils::init_ata_if_needed(
            token_program,
            system_program,
            signer,
            solauto_position.account_info,
            position_debt_ta.unwrap(),
            debt_mint.unwrap(),
        )?;
    }

    solauto_utils::initiate_dca_in_if_necessary(
        token_program,
        solauto_position,
        position_debt_ta,
        signer,
        signer_debt_ta,
    )?;

    ix_utils::update_data(solauto_position)
}
