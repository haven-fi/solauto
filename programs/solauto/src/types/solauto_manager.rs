use solana_program::{ entrypoint::ProgramResult, msg, program_error::ProgramError };

use crate::{ constants::SOLAUTO_BOOST_FEE_BPS, utils::math_utils::calculate_debt_adjustment_usd };

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
                            "Target utilization rate too low. Cannot reach this rate without deleveraging."
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
                        self.obligation_position.current_utilization_rate_bps() <
                        details.rebalance_utilization_rate_bps.unwrap()
                    {
                        msg!(
                            "Target utilization rate too high. Cannot reach this rate without increasing leverage."
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
                self.withdraw(
                    self.obligation_position.supply.as_ref().unwrap().amount_used.base_unit
                )?;
            }
        }

        // TODO: if we are unable to rebalance to desired position due to borrow / withdraw caps, client should initiate flash loan

        if self.obligation_position.current_utilization_rate_bps() > 10000 {
            return Err(SolautoError::ExceededValidUtilizationRate.into());
        }

        Ok(())
    }

    fn deposit(&mut self, base_unit_amount: u64) -> ProgramResult {
        self.client.deposit(base_unit_amount)?;
        self.obligation_position.supply_lent_update(base_unit_amount as i64)
    }

    fn borrow(&mut self, base_unit_amount: u64) -> ProgramResult {
        self.client.borrow(base_unit_amount)?;
        self.obligation_position.debt_borrowed_update(base_unit_amount as i64)
    }

    fn withdraw(&mut self, base_unit_amount: u64) -> ProgramResult {
        self.client.withdraw(base_unit_amount)?;
        self.obligation_position.supply_lent_update((base_unit_amount as i64) * -1)
    }

    fn repay(&mut self, base_unit_amount: u64) -> ProgramResult {
        self.client.repay(base_unit_amount)?;
        self.obligation_position.debt_borrowed_update((base_unit_amount as i64) * -1)
    }

    pub fn rebalance(&mut self, target_utilization_rate_bps: u16) -> ProgramResult {
        if self.obligation_position.current_utilization_rate_bps() < target_utilization_rate_bps {
            self.increase_leverage(target_utilization_rate_bps)
        } else {
            self.decrease_leverage(target_utilization_rate_bps)
        }
    }

    fn increase_leverage(&mut self, target_utilization_rate_bps: u16) -> ProgramResult {
        let (debt_adjustment_usd, solauto_fee_usd) = calculate_debt_adjustment_usd(
            self.obligation_position.open_ltv,
            self.obligation_position.supply.as_ref().unwrap().amount_used.usd_value as f64,
            self.obligation_position.debt.as_ref().unwrap().amount_used.usd_value as f64,
            target_utilization_rate_bps,
            Some(SOLAUTO_BOOST_FEE_BPS)
        );
        // borrow_value = min(debt_adjustment_usd, available debt token to borrow * 0.9)
        // msg! if borrow_value < debt_adjustment_usd 
        // solauto_fee_value = min(solauto_fee_usd, borrow_value * (SOLAUTO_BOOST_FEE_BPS / 10000))
        // Swap borrow_value - solauto_fee_value to supply token
        // Deposit supply token
        // send solauto fee value to solauto fee receiver. Should we convert this to SOL? Or receive fees in USDC? Have a setting?
        Ok(())
    }

    fn decrease_leverage(&mut self, target_utilization_rate_bps: u16) -> ProgramResult {
        // TODO
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
