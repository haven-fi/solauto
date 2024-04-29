use solana_program::entrypoint::ProgramResult;

use crate::{
    clients::{marginfi::MarginfiClient, solend::SolendClient},
    types::{
        instruction::{
            accounts::{
                Context, MarginfiProtocolInteractionAccounts, SolendProtocolInteractionAccounts,
            },
            SolautoAction, SolautoStandardAccounts,
        },
        lending_protocol::LendingProtocolClient,
        obligation_position::LendingProtocolObligationPosition,
        solauto_manager::{SolautoManager, SolautoManagerAccounts},
    },
    utils::{ix_utils, solana_utils::init_ata_if_needed},
};

pub fn marginfi_interaction<'a, 'b>(
    ctx: Context<'a, MarginfiProtocolInteractionAccounts<'a>>,
    std_accounts: SolautoStandardAccounts<'a>,
    action: SolautoAction,
) -> ProgramResult {
    let (marginfi_client, obligation_position) = MarginfiClient::from(
        ctx.accounts.signer,
        ctx.accounts.marginfi_group,
        ctx.accounts.marginfi_account,
        ctx.accounts.supply_bank,
        ctx.accounts.authority_supply_ta,
        ctx.accounts.vault_supply_ta,
        ctx.accounts.supply_vault_authority,
        ctx.accounts.debt_bank,
        ctx.accounts.authority_debt_ta,
        ctx.accounts.vault_debt_ta,
        ctx.accounts.debt_vault_authority,
    )?;
    let solauto_manager_accounts = SolautoManagerAccounts::from(
        ctx.accounts.authority_supply_ta,
        ctx.accounts.vault_supply_ta,
        ctx.accounts.authority_debt_ta,
        ctx.accounts.vault_debt_ta,
        None,
    )?;

    protocol_interaction(
        marginfi_client,
        obligation_position,
        solauto_manager_accounts,
        std_accounts,
        action,
    )
}

pub fn solend_interaction<'a, 'b>(
    ctx: Context<'a, SolendProtocolInteractionAccounts<'a>>,
    std_accounts: SolautoStandardAccounts<'a>,
    action: SolautoAction,
) -> ProgramResult {
    let (solend_client, obligation_position) = SolendClient::from(
        ctx.accounts.lending_market,
        ctx.accounts.obligation,
        ctx.accounts.supply_reserve,
        ctx.accounts.supply_reserve_pyth_price_oracle,
        ctx.accounts.supply_reserve_switchboard_oracle,
        ctx.accounts.authority_supply_liquidity_ta,
        ctx.accounts.reserve_supply_liquidity_ta,
        ctx.accounts.supply_collateral_mint,
        ctx.accounts.authority_supply_collateral_ta,
        ctx.accounts.reserve_supply_collateral_ta,
        ctx.accounts.debt_reserve,
        ctx.accounts.debt_reserve_fee_receiver_ta,
        ctx.accounts.authority_debt_liquidity_ta,
        ctx.accounts.reserve_debt_liquidity_ta,
    )?;
    let solauto_manager_accounts = SolautoManagerAccounts::from(
        ctx.accounts.authority_supply_liquidity_ta,
        ctx.accounts.reserve_supply_liquidity_ta,
        ctx.accounts.authority_debt_liquidity_ta,
        ctx.accounts.reserve_debt_liquidity_ta,
        None,
    )?;

    if ctx.accounts.authority_supply_collateral_ta.is_some() {
        init_ata_if_needed(
            ctx.accounts.token_program,
            ctx.accounts.system_program,
            ctx.accounts.rent,
            ctx.accounts.signer,
            ctx.accounts.signer,
            ctx.accounts.authority_supply_collateral_ta.unwrap(),
            ctx.accounts.supply_collateral_mint.unwrap(),
        )?;
    }

    protocol_interaction(
        solend_client,
        obligation_position,
        solauto_manager_accounts,
        std_accounts,
        action,
    )
}

fn protocol_interaction<'a, T: LendingProtocolClient<'a>>(
    client: T,
    mut obligation_position: LendingProtocolObligationPosition,
    solauto_manager_accounts: SolautoManagerAccounts<'a>,
    std_accounts: SolautoStandardAccounts<'a>,
    action: SolautoAction,
) -> ProgramResult {
    let mut solauto_manager = SolautoManager::from(
        &client,
        &mut obligation_position,
        solauto_manager_accounts,
        std_accounts,
    )?;
    solauto_manager.protocol_interaction(action)?;

    SolautoManager::refresh_position(
        &solauto_manager.obligation_position,
        &mut solauto_manager.std_accounts.solauto_position,
        None,
        None,
    )?;
    ix_utils::update_data(&mut solauto_manager.std_accounts.solauto_position)
}
