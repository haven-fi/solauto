use solana_program::entrypoint::ProgramResult;

use crate::{
    clients::{ marginfi::MarginfiClient, solend::SolendClient },
    types::{
        instruction::{
            accounts::{
                Context,
                MarginfiProtocolInteractionAccounts,
                SolendProtocolInteractionAccounts,
            },
            SolautoAction,
            SolautoStandardAccounts,
        },
        lending_protocol::LendingProtocolClient,
        obligation_position::LendingProtocolObligationPosition,
        solauto_manager::{ SolautoManager, SolautoManagerAccounts },
    },
    utils::{ ix_utils, solana_utils::init_ata_if_needed },
};

pub fn marginfi_interaction<'a, 'b>(
    ctx: Context<'a, MarginfiProtocolInteractionAccounts<'a>>,
    std_accounts: SolautoStandardAccounts<'a>,
    action: SolautoAction
) -> ProgramResult {
    let (marginfi_client, obligation_position) = MarginfiClient::from(ctx.accounts.signer)?;
    let solauto_manager_accounts = SolautoManagerAccounts::from(
        ctx.accounts.supply_mint,
        ctx.accounts.source_supply_ta,
        ctx.accounts.bank_supply_ta,
        ctx.accounts.debt_mint,
        ctx.accounts.source_debt_ta,
        ctx.accounts.bank_debt_ta,
        None
    );
    protocol_interaction(
        marginfi_client,
        obligation_position,
        solauto_manager_accounts,
        std_accounts,
        action
    )
}

pub fn solend_interaction<'a, 'b>(
    ctx: Context<'a, SolendProtocolInteractionAccounts<'a>>,
    std_accounts: SolautoStandardAccounts<'a>,
    action: SolautoAction
) -> ProgramResult {
    let (solend_client, obligation_position) = SolendClient::from(
        ctx.accounts.lending_market,
        ctx.accounts.obligation,
        ctx.accounts.supply_reserve,
        ctx.accounts.supply_reserve_pyth_price_oracle,
        ctx.accounts.supply_reserve_switchboard_oracle,
        ctx.accounts.supply_liquidity_mint,
        ctx.accounts.source_supply_liquidity_ta,
        ctx.accounts.reserve_supply_liquidity_ta,
        ctx.accounts.supply_collateral_mint,
        ctx.accounts.source_supply_collateral_ta,
        ctx.accounts.reserve_supply_collateral_ta,
        ctx.accounts.debt_reserve,
        ctx.accounts.debt_reserve_fee_receiver_ta,
        ctx.accounts.debt_liquidity_mint,
        ctx.accounts.source_debt_liquidity_ta,
        ctx.accounts.reserve_debt_liquidity_ta
    )?;
    let solauto_manager_accounts = SolautoManagerAccounts::from(
        ctx.accounts.supply_liquidity_mint,
        ctx.accounts.source_supply_liquidity_ta,
        ctx.accounts.reserve_supply_liquidity_ta,
        ctx.accounts.debt_liquidity_mint,
        ctx.accounts.source_debt_liquidity_ta,
        ctx.accounts.reserve_debt_liquidity_ta,
        None
    );

    protocol_interaction(
        solend_client,
        obligation_position,
        solauto_manager_accounts,
        std_accounts,
        action
    )
}

fn protocol_interaction<'a, T: LendingProtocolClient<'a>>(
    client: T,
    mut obligation_position: LendingProtocolObligationPosition,
    solauto_manager_accounts: SolautoManagerAccounts<'a>,
    std_accounts: SolautoStandardAccounts<'a>,
    action: SolautoAction
) -> ProgramResult {
    if let SolautoAction::Withdraw(_) = action {
        init_ata_if_needed(
            std_accounts.token_program,
            std_accounts.system_program,
            std_accounts.rent,
            std_accounts.signer,
            std_accounts.signer,
            solauto_manager_accounts.supply.as_ref().unwrap().source_ta,
            solauto_manager_accounts.supply.as_ref().unwrap().mint
        )?;
    } else if let SolautoAction::Borrow(_) = action {
        init_ata_if_needed(
            std_accounts.token_program,
            std_accounts.system_program,
            std_accounts.rent,
            std_accounts.signer,
            std_accounts.signer,
            solauto_manager_accounts.debt.as_ref().unwrap().source_ta,
            solauto_manager_accounts.debt.as_ref().unwrap().mint
        )?;
    }

    let mut solauto_manager = SolautoManager::from(
        &client,
        &mut obligation_position,
        solauto_manager_accounts,
        std_accounts
    )?;
    solauto_manager.protocol_interaction(action)?;

    SolautoManager::refresh_position(
        &solauto_manager.obligation_position,
        &mut solauto_manager.std_accounts.solauto_position
    );
    ix_utils::update_data(&mut solauto_manager.std_accounts.solauto_position)
}
