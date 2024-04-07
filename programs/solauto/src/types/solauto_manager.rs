use solana_program::{ entrypoint::ProgramResult, msg, program_error::ProgramError };

use super::{
    instruction::ProtocolInteractionArgs,
    lending_protocol::LendingProtocolClient,
    obligation_position::LendingProtocolObligationPosition,
    shared::{ DeserializedAccount, Position, ProtocolAction, SolautoError },
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
        // TODO: in the case where position is solauto-managed but user calls deposit or repay with a rebalance, we need to ensure the user's debt token account is created before calling this. Should we do it on open position? 

        match args.action {
            ProtocolAction::Deposit(details) => {
                if !details.amount.is_none() {
                    self.deposit(details.amount.unwrap())?;
                }

                if !details.rebalance_utilization_rate_bps.is_none() {
                    if
                        self.obligation_position.current_utilization_rate_bps() >
                        details.rebalance_utilization_rate_bps.unwrap()
                    {
                        msg!(
                            "Target utilization rate is too low. Cannot reach this rate without depositing additional supply or repaying debt"
                        );
                        return Err(SolautoError::UnableToReposition.into());
                    } else {
                        self.rebalance(details.rebalance_utilization_rate_bps.unwrap())?;
                    }
                }
            }
            ProtocolAction::Borrow(base_unit_amount) => {
                self.borrow(base_unit_amount)?;
            }
            ProtocolAction::Repay(details) => {
                if !details.amount.is_none() {
                    self.repay(details.amount.unwrap())?;
                }

                if !details.rebalance_utilization_rate_bps.is_none() {
                    if
                        self.obligation_position.current_utilization_rate_bps() >
                        details.rebalance_utilization_rate_bps.unwrap()
                    {
                        msg!(
                            "Target utilization rate is too low. Cannot reach this rate without repaying additional debt or depositing supply"
                        );
                        return Err(SolautoError::UnableToReposition.into());
                    } else {
                        self.rebalance(details.rebalance_utilization_rate_bps.unwrap())?;
                    }
                }
            }
            ProtocolAction::Withdraw(base_unit_amount) => {
                self.withdraw(base_unit_amount)?;
            }
            ProtocolAction::ClosePosition => {
                self.rebalance(0)?;
                self.withdraw(self.obligation_position.supply.as_ref().unwrap().amount_used.base_unit)?;
            }
        }

        // TODO: inside each client's implementation of the 4 basic function, should we check if the token account has sufficient balance? Solana would error out if we pulled more than we should anyway

        // TODO: if we are unable to rebalance to desired position due to borrow / withdraw caps, client should initiate flash loan

        if self.obligation_position.current_utilization_rate_bps() > 10000 {
            return Err(SolautoError::ExceededValidUtilizationRate.into());
        }

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
        self.obligation_position.supply_update((base_unit_amount as i64) * -1)
    }

    fn repay(&mut self, base_unit_amount: u64) -> ProgramResult {
        self.client.repay(base_unit_amount)?;
        self.obligation_position.debt_update((base_unit_amount as i64) * -1)
    }

    fn rebalance(&mut self, target_utilization_rate_bps: u16) -> ProgramResult {
        // TODO: rebalance to target utilization rate
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
