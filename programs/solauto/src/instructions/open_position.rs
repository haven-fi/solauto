use solana_program::{ account_info::AccountInfo, entrypoint::ProgramResult, program_pack::Pack };
use solend_sdk::state::Obligation;

use crate::{
    clients::{ marginfi::MarginfiClient, solend::SolendClient },
    types::{
        instruction::accounts::{
            Context,
            MarginfiOpenPositionAccounts,
            SolendOpenPositionAccounts,
        },
        shared::{ DeserializedAccount, Position, POSITION_ACCOUNT_SPACE },
    },
    utils::*,
};

pub fn marginfi_open_position<'a>(
    ctx: Context<'a, MarginfiOpenPositionAccounts<'a>>,
    mut solauto_position: Option<DeserializedAccount<'a, Position>>
) -> ProgramResult {
    initialize_solauto_position(
        &mut solauto_position,
        ctx.accounts.system_program,
        ctx.accounts.token_program,
        ctx.accounts.rent,
        ctx.accounts.signer,
        ctx.accounts.supply_token_account,
        ctx.accounts.supply_token_mint,
        ctx.accounts.debt_token_account,
        ctx.accounts.debt_token_mint
    )?;

    let marginfi_account_seeds = if !solauto_position.is_none() {
        vec![
            ctx.accounts.solauto_position.unwrap().key.as_ref(),
            ctx.accounts.signer.key.as_ref(),
            ctx.accounts.marginfi_program.key.as_ref()
        ]
    } else {
        vec![ctx.accounts.signer.key.as_ref(), ctx.accounts.marginfi_program.key.as_ref()]
    };
    solana_utils::init_new_account(
        ctx.accounts.system_program,
        ctx.accounts.rent,
        ctx.accounts.signer,
        ctx.accounts.marginfi_account,
        ctx.accounts.marginfi_program.key,
        marginfi_account_seeds,
        Obligation::LEN // TODO: get marginfi account space from MarginfiAccount::LEN from generated code
    )?;

    MarginfiClient::initialize(&ctx, &solauto_position)?;
    ix_utils::update_data(&mut solauto_position)
}

pub fn solend_open_position<'a>(
    ctx: Context<'a, SolendOpenPositionAccounts<'a>>,
    mut solauto_position: Option<DeserializedAccount<'a, Position>>
) -> ProgramResult {
    initialize_solauto_position(
        &mut solauto_position,
        ctx.accounts.system_program,
        ctx.accounts.token_program,
        ctx.accounts.rent,
        ctx.accounts.signer,
        ctx.accounts.supply_collateral_token_account,
        ctx.accounts.supply_collateral_token_mint,
        ctx.accounts.debt_liquidity_token_account,
        ctx.accounts.debt_liquidity_token_mint
    )?;

    let obligation_seeds = if !solauto_position.is_none() {
        vec![
            ctx.accounts.solauto_position.unwrap().key.as_ref(),
            ctx.accounts.signer.key.as_ref(),
            ctx.accounts.lending_market.key.as_ref(),
            ctx.accounts.solend_program.key.as_ref()
        ]
    } else {
        vec![
            ctx.accounts.signer.key.as_ref(),
            ctx.accounts.lending_market.key.as_ref(),
            ctx.accounts.solend_program.key.as_ref()
        ]
    };
    solana_utils::init_new_account(
        ctx.accounts.system_program,
        ctx.accounts.rent,
        ctx.accounts.signer,
        ctx.accounts.obligation,
        ctx.accounts.solend_program.key,
        obligation_seeds,
        Obligation::LEN
    )?;

    SolendClient::initialize(&ctx, &solauto_position)?;
    ix_utils::update_data(&mut solauto_position)
}

fn initialize_solauto_position<'a, 'b>(
    solauto_position: &'b mut Option<DeserializedAccount<'a, Position>>,
    system_program: &'a AccountInfo<'a>,
    token_program: &'a AccountInfo<'a>,
    rent: &'a AccountInfo<'a>,
    signer: &'a AccountInfo<'a>,
    supply_token_account: &'a AccountInfo<'a>,
    supply_token_mint: &'a AccountInfo<'a>,
    debt_token_account: &'a AccountInfo<'a>,
    debt_token_mint: &'a AccountInfo<'a>
) -> ProgramResult {
    if !solauto_position.is_none() {
        solana_utils::init_new_account(
            system_program,
            rent,
            signer,
            solauto_position.as_ref().unwrap().account_info,
            &crate::ID,
            vec![&[solauto_position.as_ref().unwrap().data.position_id], signer.key.as_ref()],
            POSITION_ACCOUNT_SPACE
        )?;
    }

    let obligation_owner = solauto_utils::get_owner(solauto_position, signer);

    solana_utils::init_ata_if_needed(
        token_program,
        system_program,
        rent,
        signer,
        obligation_owner,
        supply_token_account,
        supply_token_mint
    )?;

    solana_utils::init_ata_if_needed(
        token_program,
        system_program,
        rent,
        signer,
        obligation_owner,
        debt_token_account,
        debt_token_mint
    )?;

    Ok(())
}
