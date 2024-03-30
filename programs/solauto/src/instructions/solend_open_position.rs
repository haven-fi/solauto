use solana_program::{ entrypoint::ProgramResult, program_pack::Pack };
use solend_sdk::state::Obligation;

use crate::{
    solend::client::SolendClient,
    types::{
        instruction::accounts::{ Context, SolendOpenPositionAccounts },
        shared::{ DeserializedAccount, Position, POSITION_LEN },
    },
    utils::*,
};

pub fn solend_open_position(
    ctx: Context<SolendOpenPositionAccounts>,
    solauto_position: &mut Option<DeserializedAccount<Position>>
) -> ProgramResult {
    if !solauto_position.is_none() {
        solana_utils::init_new_account(
            ctx.accounts.system_program,
            ctx.accounts.rent,
            ctx.accounts.signer,
            ctx.accounts.solauto_position.unwrap(),
            &crate::ID,
            vec![&[solauto_position.as_ref().unwrap().data.position_id], ctx.accounts.signer.key.as_ref()],
            POSITION_LEN
        )?;
    }

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

    SolendClient::init_new(&ctx)
}
