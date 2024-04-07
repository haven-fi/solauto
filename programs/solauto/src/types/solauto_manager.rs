use solana_program::{ entrypoint::ProgramResult, program_error::ProgramError };

use super::{
    instruction::ProtocolInteractionArgs,
    lending_protocol::LendingProtocolClient,
    obligation_position::LendingProtocolObligationPosition,
    shared::{ DeserializedAccount, Position, ProtocolAction },
};

pub struct SolautoManager<'a> {
    client: &'a dyn LendingProtocolClient,
    obligation_position: &'a mut LendingProtocolObligationPosition,
}

impl<'a> SolautoManager<'a> {
    pub fn from(
        client: &'a dyn LendingProtocolClient,
        obligation_position: &'a mut LendingProtocolObligationPosition
    ) -> Result<Self, ProgramError> {
        client.validate()?;
        Ok(Self {
            client,
            obligation_position,
        })
    }

    pub fn protocol_interaction(&mut self, args: ProtocolInteractionArgs) -> ProgramResult {
        match args.action {
            ProtocolAction::Deposit(details) => {
                self.deposit(details.action_amount)?;
                if !details.rebalance_utilization_rate_bps.is_none() {

                }
            }
            ProtocolAction::Borrow(details) => {
                if !details.rebalance_utilization_rate_bps.is_none() {

                }
            }
            ProtocolAction::Repay(details) => {
                if !details.rebalance_utilization_rate_bps.is_none() {

                }
            }
            ProtocolAction::Withdraw(details) => {
                if !details.rebalance_utilization_rate_bps.is_none() {

                }
            }
            ProtocolAction::ClosePosition => {

            }
        }

        // TODO: if we are unable to rebalance to desired position due to borrow / withdraw caps, client should initiate flash loan

        Ok(())
    }

    fn deposit(&mut self, base_unit_amount: u64) -> ProgramResult {
        self.client.deposit(base_unit_amount)?;
        self.obligation_position.supply_update(base_unit_amount as i64)
    }

    fn borrow(&mut self, base_unit_amount: u64) -> ProgramResult {
        self.client.borrow(base_unit_amount)?;
        self.obligation_position.debt_update(base_unit_amount as i64)
    }

    fn withdraw(&mut self, base_unit_amount: u64) -> ProgramResult {
        self.client.withdraw(base_unit_amount)?;
        self.obligation_position.supply_update(base_unit_amount as i64 * -1)
    }

    fn repay(&mut self, base_unit_amount: u64) -> ProgramResult {
        self.client.repay(base_unit_amount)?;
        self.obligation_position.debt_update(base_unit_amount as i64 * -1)
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
