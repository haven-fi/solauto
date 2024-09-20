use solana_program::entrypoint::ProgramResult;

use crate::{
    clients::marginfi::MarginfiClient,
    types::{
        instruction::{
            accounts::{Context, MarginfiProtocolInteractionAccounts},
            SolautoAction, SolautoStandardAccounts,
        },
        lending_protocol::{LendingProtocolClient, LendingProtocolTokenAccounts},
        solauto_manager::{SolautoManager, SolautoManagerAccounts},
    },
    utils::ix_utils,
};

pub fn marginfi_interaction<'a>(
    ctx: Context<'a, MarginfiProtocolInteractionAccounts<'a>>,
    std_accounts: Box<SolautoStandardAccounts<'a>>,
    action: SolautoAction,
) -> ProgramResult {
    let supply_tas = LendingProtocolTokenAccounts::from(
        None,
        ctx.accounts.position_supply_ta,
        None,
        ctx.accounts.vault_supply_ta,
    )?;
    let debt_tas = LendingProtocolTokenAccounts::from(
        None,
        ctx.accounts.position_debt_ta,
        None,
        ctx.accounts.vault_debt_ta,
    )?;

    let marginfi_client = Box::new(MarginfiClient::from(
        ctx.accounts.signer,
        ctx.accounts.marginfi_program,
        ctx.accounts.marginfi_group,
        ctx.accounts.marginfi_account,
        ctx.accounts.supply_bank,
        ctx.accounts.supply_price_oracle,
        supply_tas.clone(),
        ctx.accounts.supply_vault_authority,
        ctx.accounts.debt_bank,
        ctx.accounts.debt_price_oracle,
        debt_tas.clone(),
        ctx.accounts.debt_vault_authority,
    )?);
    let solauto_manager_accounts = SolautoManagerAccounts::from(supply_tas, debt_tas, None)?;

    protocol_interaction(
        marginfi_client,
        solauto_manager_accounts,
        std_accounts,
        action,
    )
}

fn protocol_interaction<'a>(
    client: Box<dyn LendingProtocolClient<'a> + 'a>,
    solauto_manager_accounts: SolautoManagerAccounts<'a>,
    std_accounts: Box<SolautoStandardAccounts<'a>>,
    action: SolautoAction,
) -> ProgramResult {
    let mut solauto_manager =
        SolautoManager::from(client, solauto_manager_accounts, std_accounts, None)?;
    solauto_manager.protocol_interaction(action)?;

    ix_utils::update_data(&mut solauto_manager.std_accounts.solauto_position)
}
