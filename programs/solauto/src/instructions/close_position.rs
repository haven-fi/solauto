use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult};
use spl_token::state::Account as TokenAccount;

use crate::{
    constants::WSOL_MINT,
    state::solauto_position::SolautoPosition,
    types::{
        instruction::accounts::{ClosePositionAccounts, Context},
        shared::DeserializedAccount,
    },
    utils::solana_utils,
};

pub fn close_position_ta<'a>(
    ctx: &Context<ClosePositionAccounts<'a>>,
    solauto_position: &DeserializedAccount<'a, SolautoPosition>,
    position_ta: &'a AccountInfo<'a>,
) -> ProgramResult {
    let solauto_position_seeds = &solauto_position.data.seeds_with_bump();
    let position_ta_data = DeserializedAccount::<TokenAccount>::unpack(Some(position_ta))?
        .unwrap()
        .data;

    if position_ta_data.amount > 0 && position_ta_data.mint != WSOL_MINT {
        solana_utils::spl_token_transfer(
            ctx.accounts.token_program,
            ctx.accounts.position_supply_ta,
            solauto_position.account_info,
            ctx.accounts.signer_supply_ta,
            position_ta_data.amount,
            Some(solauto_position_seeds),
        )?;
    }

    solana_utils::close_token_account(
        ctx.accounts.token_program,
        ctx.accounts.position_supply_ta,
        ctx.accounts.signer,
        ctx.accounts.solauto_position,
        Some(solauto_position_seeds),
    )
}

pub fn close_position<'a>(
    ctx: &Context<ClosePositionAccounts<'a>>,
    solauto_position: &DeserializedAccount<'a, SolautoPosition>,
    position_supply_ta: &'a AccountInfo<'a>,
    position_debt_ta: &'a AccountInfo<'a>,
) -> ProgramResult {
    close_position_ta(ctx, solauto_position, position_supply_ta)?;
    close_position_ta(ctx, solauto_position, position_debt_ta)?;
    solana_utils::close_pda(ctx.accounts.solauto_position, ctx.accounts.signer)
}
