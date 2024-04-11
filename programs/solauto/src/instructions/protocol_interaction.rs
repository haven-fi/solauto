use solana_program::entrypoint::ProgramResult;

use crate::{
    clients::{ marginfi::MarginfiClient, solend::SolendClient },
    types::{
        instruction::accounts::{
            Context,
            MarginfiProtocolInteractionAccounts,
            SolendProtocolInteractionAccounts,
        },
        lending_protocol::LendingProtocolClient,
        obligation_position::LendingProtocolObligationPosition,
        shared::{ DeserializedAccount, Position, SolautoAction },
        solauto_manager::{ SolautoManager, SolautoManagerAccounts },
    },
    utils::ix_utils,
};

pub fn marginfi_interaction<'a, 'b>(
    ctx: Context<'a, MarginfiProtocolInteractionAccounts<'a>>,
    solauto_position: Option<DeserializedAccount<'a, Position>>,
    action: SolautoAction
) -> ProgramResult {
    let (marginfi_client, obligation_position) = MarginfiClient::from(ctx.accounts.signer)?;
    protocol_interaction(marginfi_client, obligation_position, solauto_position, action)
}

pub fn solend_interaction<'a, 'b>(
    ctx: Context<'a, SolendProtocolInteractionAccounts<'a>>,
    solauto_position: Option<DeserializedAccount<'a, Position>>,
    action: SolautoAction
) -> ProgramResult {
    let (solend_client, obligation_position) = SolendClient::from(
        ctx.accounts.signer,
        ctx.accounts.system_program,
        ctx.accounts.token_program,
        ctx.accounts.ata_program,
        ctx.accounts.clock,
        ctx.accounts.rent,
        ctx.accounts.solauto_fees_receiver,
        ctx.accounts.lending_market,
        ctx.accounts.obligation,
        ctx.accounts.supply_reserve,
        ctx.accounts.supply_reserve_pyth_price_oracle,
        ctx.accounts.supply_reserve_switchboard_oracle,
        ctx.accounts.supply_liquidity_token_mint,
        ctx.accounts.source_supply_liquidity,
        ctx.accounts.reserve_supply_liquidity,
        ctx.accounts.supply_collateral_token_mint,
        ctx.accounts.source_supply_collateral,
        ctx.accounts.reserve_supply_collateral,
        ctx.accounts.debt_reserve,
        ctx.accounts.debt_reserve_fee_receiver,
        ctx.accounts.debt_liquidity_token_mint,
        ctx.accounts.source_debt_liquidity,
        ctx.accounts.reserve_debt_liquidity
    )?;
    protocol_interaction(solend_client, obligation_position, solauto_position, action)
}

fn protocol_interaction<'a, T: LendingProtocolClient<'a>>(
    client: T,
    mut obligation_position: LendingProtocolObligationPosition,
    solauto_position: Option<DeserializedAccount<'a, Position>>,
    action: SolautoAction
) -> ProgramResult {
    let mut solauto_manager = SolautoManager::from(
        &client,
        &mut obligation_position,
        SolautoManagerAccounts {
            solauto_position,
        }
    )?;
    solauto_manager.protocol_interaction(action)?;
    SolautoManager::refresh_position(&solauto_manager.obligation_position, &mut solauto_manager.accounts.solauto_position);
    ix_utils::update_data(&mut solauto_manager.accounts.solauto_position)
}
