use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    program_pack::Pack,
};
use solend_sdk::state::Obligation;

use crate::{
    clients::{ marginfi::MarginfiClient, solend::SolendClient },
    types::{
        instruction::accounts::{
            Context,
            MarginfiOpenPositionAccounts,
            SolendOpenPositionAccounts,
        },
        shared::{ DeserializedAccount, PositionAccount, SolautoError, POSITION_ACCOUNT_SPACE },
    },
    utils::*,
};

use self::{ solana_utils::account_is_rent_exempt, solauto_utils::get_owner };

pub fn marginfi_open_position<'a>(
    ctx: Context<'a, MarginfiOpenPositionAccounts<'a>>,
    mut solauto_position: DeserializedAccount<'a, PositionAccount>
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
        ctx.accounts.debt_mint
    )?;

    let marginfi_account_seeds = if !solauto_position.data.self_managed {
        vec![
            solauto_position.account_info.key.as_ref(),
            ctx.accounts.signer.key.as_ref(),
            ctx.accounts.marginfi_program.key.as_ref()
        ]
    } else {
        vec![ctx.accounts.signer.key.as_ref(), ctx.accounts.marginfi_program.key.as_ref()]
    };

    if !account_is_rent_exempt(ctx.accounts.rent, ctx.accounts.marginfi_account)? {
        solana_utils::init_new_account(
            ctx.accounts.system_program,
            ctx.accounts.rent,
            ctx.accounts.signer,
            ctx.accounts.marginfi_account,
            ctx.accounts.marginfi_program.key,
            marginfi_account_seeds,
            Obligation::LEN // TODO: get marginfi account space from MarginfiAccount::LEN from generated code
        )?;
    } else {
        let owner = get_owner(&solauto_position, ctx.accounts.signer);
        // TODO deserialize marginfi account to check to make sure the account owner is correct
        // if owner.key != &marginfi_account.owner {
        //     msg!("Provided incorrect marginfi account for the given signer & solauto_position");
        //     return Err(ProgramError::InvalidAccountData.into());
        // }
    }

    solauto_utils::initiate_dca_in_if_necessary(
        ctx.accounts.token_program,
        &mut solauto_position,
        Some(ctx.accounts.position_supply_ta),
        ctx.accounts.signer,
        ctx.accounts.signer_supply_ta,
        Some(ctx.accounts.supply_mint)
    )?;

    MarginfiClient::initialize(&ctx, &solauto_position)?;
    ix_utils::update_data(&mut solauto_position)
}

pub fn solend_open_position<'a>(
    ctx: Context<'a, SolendOpenPositionAccounts<'a>>,
    mut solauto_position: DeserializedAccount<'a, PositionAccount>
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
        ctx.accounts.debt_liquidity_mint
    )?;

    solana_utils::init_ata_if_needed(
        ctx.accounts.token_program,
        ctx.accounts.system_program,
        ctx.accounts.rent,
        ctx.accounts.signer,
        solauto_position.account_info,
        ctx.accounts.position_supply_collateral_ta,
        ctx.accounts.supply_collateral_mint
    )?;

    let obligation_seeds = if !solauto_position.data.self_managed {
        vec![
            solauto_position.account_info.key.as_ref(),
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

    if !account_is_rent_exempt(ctx.accounts.rent, ctx.accounts.obligation)? {
        solana_utils::init_new_account(
            ctx.accounts.system_program,
            ctx.accounts.rent,
            ctx.accounts.signer,
            ctx.accounts.obligation,
            ctx.accounts.solend_program.key,
            obligation_seeds,
            Obligation::LEN
        )?;
    } else {
        let owner = get_owner(&solauto_position, ctx.accounts.signer);
        let obligation = Obligation::unpack(&ctx.accounts.obligation.data.borrow()).map_err(
            |_| SolautoError::FailedAccountDeserialization
        )?;
        if owner.key != &obligation.owner {
            msg!("Provided incorrect obligation account for the given signer & solauto_position");
            return Err(ProgramError::InvalidAccountData.into());
        }
    }

    solauto_utils::initiate_dca_in_if_necessary(
        ctx.accounts.token_program,
        &mut solauto_position,
        Some(ctx.accounts.position_supply_liquidity_ta),
        ctx.accounts.signer,
        ctx.accounts.signer_supply_liquidity_ta,
        Some(ctx.accounts.supply_liquidity_mint)
    )?;

    SolendClient::initialize(&ctx, &solauto_position)?;
    ix_utils::update_data(&mut solauto_position)
}

fn initialize_solauto_position<'a, 'b>(
    solauto_position: &'b mut DeserializedAccount<'a, PositionAccount>,
    system_program: &'a AccountInfo<'a>,
    token_program: &'a AccountInfo<'a>,
    rent: &'a AccountInfo<'a>,
    signer: &'a AccountInfo<'a>,
    supply_ta: &'a AccountInfo<'a>,
    supply_mint: &'a AccountInfo<'a>,
    debt_ta: &'a AccountInfo<'a>,
    debt_mint: &'a AccountInfo<'a>
) -> ProgramResult {
    if
        !solauto_position.data.self_managed ||
        !account_is_rent_exempt(rent, solauto_position.account_info)?
    {
        solana_utils::init_new_account(
            system_program,
            rent,
            signer,
            solauto_position.account_info,
            &crate::ID,
            vec![&[solauto_position.data.position_id], signer.key.as_ref()],
            POSITION_ACCOUNT_SPACE
        )?;
    }

    solana_utils::init_ata_if_needed(
        token_program,
        system_program,
        rent,
        signer,
        solauto_position.account_info,
        supply_ta,
        supply_mint
    )?;

    solana_utils::init_ata_if_needed(
        token_program,
        system_program,
        rent,
        signer,
        solauto_position.account_info,
        debt_ta,
        debt_mint
    )?;

    Ok(())
}
