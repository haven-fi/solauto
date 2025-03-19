use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult};

use crate::{
    constants::WSOL_MINT,
    state::solauto_position::SolautoPosition,
    types::{
        instruction::accounts::{ClosePositionAccounts, Context},
        shared::DeserializedAccount,
        solana::SplTokenTransferArgs,
    },
    utils::{solana_utils, solauto_utils},
};

pub fn close_position_ta<'a>(
    ctx: &Context<ClosePositionAccounts<'a>>,
    solauto_position: &DeserializedAccount<'a, SolautoPosition>,
    position_ta: &'a AccountInfo<'a>,
    signer_ta: &'a AccountInfo<'a>,
) -> ProgramResult {
    let solauto_position_seeds = &solauto_position.data.seeds_with_bump();
    let position_ta_data = solauto_utils::safe_unpack_token_account(Some(position_ta))?
        .unwrap()
        .data;

    if position_ta_data.amount > 0 && position_ta_data.mint != WSOL_MINT {
        solana_utils::spl_token_transfer(
            ctx.accounts.token_program,
            SplTokenTransferArgs {
                source: position_ta,
                authority: solauto_position.account_info,
                recipient: signer_ta,
                amount: position_ta_data.amount,
                authority_seeds: Some(solauto_position_seeds),
            },
        )?;
    }

    solana_utils::close_token_account(
        ctx.accounts.token_program,
        position_ta,
        ctx.accounts.signer,
        ctx.accounts.solauto_position,
        Some(solauto_position_seeds),
    )
}

pub fn close_position<'a>(
    ctx: &Context<ClosePositionAccounts<'a>>,
    solauto_position: &DeserializedAccount<'a, SolautoPosition>,
) -> ProgramResult {
    close_position_ta(
        ctx,
        solauto_position,
        ctx.accounts.position_supply_ta,
        ctx.accounts.signer_supply_ta,
    )?;
    close_position_ta(
        ctx,
        solauto_position,
        ctx.accounts.position_debt_ta,
        ctx.accounts.signer_debt_ta,
    )?;
    solana_utils::close_pda(ctx.accounts.solauto_position, ctx.accounts.signer)
}
