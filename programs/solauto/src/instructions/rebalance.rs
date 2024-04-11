use solana_program::entrypoint::ProgramResult;

use crate::{
    clients::{ marginfi::MarginfiClient, solend::SolendClient },
    types::{
        instruction::{
            accounts::{ Context, MarginfiRebalanceAccounts, SolendRebalanceAccounts },
            OptionalUtilizationRateBps,
        },
        lending_protocol::LendingProtocolClient,
        obligation_position::LendingProtocolObligationPosition,
        shared::{ DeserializedAccount, Position, SolautoError },
        solauto_manager::{SolautoManager, SolautoManagerAccounts},
    }, utils::ix_utils,
};

pub fn marginfi_rebalance<'a, 'b>(
    ctx: Context<'a, MarginfiRebalanceAccounts<'a>>,
    solauto_position: Option<DeserializedAccount<'a, Position>>,
    target_utilization_rate_bps: OptionalUtilizationRateBps
) -> ProgramResult {
    let (marginfi_client, obligation_position) = MarginfiClient::from(ctx.accounts.signer)?;
    rebalance(marginfi_client, obligation_position, solauto_position, target_utilization_rate_bps)
}

pub fn solend_rebalance<'a, 'b>(
    ctx: Context<'a, SolendRebalanceAccounts<'a>>,
    solauto_position: Option<DeserializedAccount<'a, Position>>,
    target_utilization_rate_bps: OptionalUtilizationRateBps
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
    rebalance(solend_client, obligation_position, solauto_position, target_utilization_rate_bps)
}

fn rebalance<'a, T: LendingProtocolClient<'a>>(
    client: T,
    mut obligation_position: LendingProtocolObligationPosition,
    solauto_position: Option<DeserializedAccount<'a, Position>>,
    target_utilization_rate_bps: OptionalUtilizationRateBps
) -> ProgramResult {
    let target_utilization_rate: Result<u16, SolautoError> = if !target_utilization_rate_bps.is_none() {
        Ok(target_utilization_rate_bps.unwrap())
    } else {
        let setting_params = &solauto_position.as_ref().unwrap().data.setting_params;
        let current_utilization_rate = obligation_position.current_utilization_rate_bps();
        if current_utilization_rate < setting_params.boost_from_bps {
            Ok(setting_params.boost_to_bps)
        } else if current_utilization_rate > setting_params.repay_from_bps {
            Ok(setting_params.repay_to_bps)
        } else {
            return Err(SolautoError::InvalidRebalanceCondition.into());
        }
    };
    
    let mut solauto_manager = SolautoManager::from(&client, &mut obligation_position, SolautoManagerAccounts {
        solauto_position
    })?;
    
    solauto_manager.rebalance(target_utilization_rate.unwrap())?;
    
    SolautoManager::refresh_position(&solauto_manager.obligation_position, &mut solauto_manager.accounts.solauto_position);
    ix_utils::update_data(&mut solauto_manager.accounts.solauto_position)
}
