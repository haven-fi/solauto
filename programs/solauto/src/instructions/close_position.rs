use solana_program::entrypoint::ProgramResult;
use spl_token::state::Account as TokenAccount;

use crate::{
    constants::WSOL_MINT,
    types::{
        instruction::accounts::{ClosePositionAccounts, Context},
        shared::{DeserializedAccount, SolautoPosition},
    },
    utils::solana_utils,
};

pub fn close_position<'a>(
    ctx: Context<ClosePositionAccounts<'a>>,
    solauto_position: DeserializedAccount<'a, SolautoPosition>,
    position_debt_liquidity_ta: Option<DeserializedAccount<'a, TokenAccount>>,
) -> ProgramResult {
    let solauto_position_seeds = &solauto_position.data.seeds();

    solana_utils::close_token_account(
        ctx.accounts.token_program,
        ctx.accounts.position_supply_liquidity_ta,
        ctx.accounts.signer,
        ctx.accounts.solauto_position,
        Some(solauto_position_seeds),
    )?;

    if ctx.accounts.position_supply_collateral_ta.is_some() {
        solana_utils::close_token_account(
            ctx.accounts.token_program,
            ctx.accounts.position_supply_collateral_ta.unwrap(),
            ctx.accounts.signer,
            ctx.accounts.solauto_position,
            Some(solauto_position_seeds),
        )?;
    }

    if position_debt_liquidity_ta.is_some()
        && position_debt_liquidity_ta.as_ref().unwrap().data.mint != WSOL_MINT
        && position_debt_liquidity_ta.as_ref().unwrap().data.amount > 0
    {
        solana_utils::spl_token_transfer(
            ctx.accounts.token_program,
            ctx.accounts.position_supply_liquidity_ta,
            solauto_position.account_info,
            ctx.accounts.signer_supply_liquidity_ta,
            position_debt_liquidity_ta.as_ref().unwrap().data.amount,
            Some(solauto_position_seeds),
        )?;
    }

    if ctx.accounts.position_debt_liquidity_ta.is_some() {
        solana_utils::close_token_account(
            ctx.accounts.token_program,
            ctx.accounts.position_debt_liquidity_ta.unwrap(),
            ctx.accounts.signer,
            ctx.accounts.solauto_position,
            Some(solauto_position_seeds),
        )?;
    }

    solana_utils::close_pda(
        ctx.accounts.system_program,
        ctx.accounts.solauto_position,
        ctx.accounts.signer,
        Some(solauto_position_seeds),
    )
}
