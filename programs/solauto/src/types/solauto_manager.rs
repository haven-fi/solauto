use solana_program::{ entrypoint::ProgramResult, program_error::ProgramError };

use super::{
    instruction::ProtocolInteractionArgs,
    lending_protocol::LendingProtocolClient,
    obligation_position::LendingProtocolObligationPosition,
    shared::{ DeserializedAccount, Position },
};

pub struct SolautoManager<'a> {
    client: &'a dyn LendingProtocolClient,
    obligation_position: &'a LendingProtocolObligationPosition,
}

impl<'a> SolautoManager<'a> {
    pub fn from(
        client: &'a dyn LendingProtocolClient,
        obligation_position: &'a LendingProtocolObligationPosition
    ) -> Result<Self, ProgramError> {
        client.validate()?;
        Ok(Self {
            client,
            obligation_position,
        })
    }

    pub fn protocol_interaction(&self, args: ProtocolInteractionArgs) -> ProgramResult {
        // TODO: take action based on args
        // TODO: if we are unable to rebalance to desired position due to borrow / withdraw caps, client should initiate flash loan
        Ok(())
    }

    pub fn refresh_position(
        obligation_position: &LendingProtocolObligationPosition,
        solauto_position: &mut DeserializedAccount<Position>
    ) -> ProgramResult {
        solauto_position.data.general_data.net_worth_usd_base_amount =
            obligation_position.net_worth_usd_base_amount();
        solauto_position.data.general_data.base_amount_liquidity_net_worth =
            obligation_position.net_worth_base_amount();
        solauto_position.data.general_data.utilization_rate_bps =
            obligation_position.current_utilization_rate_bps();
        solauto_position.data.general_data.base_amount_supplied = if
            !obligation_position.supply.is_none()
        {
            obligation_position.supply.as_ref().unwrap().amount_used.base_unit
        } else {
            0
        };
        solauto_position.data.general_data.base_amount_supplied = if
            !obligation_position.debt.is_none()
        {
            obligation_position.debt.as_ref().unwrap().amount_used.base_unit
        } else {
            0
        };

        Ok(())
    }
}
