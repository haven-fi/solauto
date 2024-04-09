use std::{ cmp::min, ops::{ Div, Mul, Sub } };

use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
};

use crate::{
    constants::SOLAUTO_BOOST_FEE_BPS,
    utils::math_utils::{ calculate_debt_adjustment_usd, to_base_unit },
};

use super::{
    instruction::ProtocolInteractionArgs,
    lending_protocol::LendingProtocolClient,
    obligation_position::LendingProtocolObligationPosition,
    shared::{ DeserializedAccount, Position, ProtocolAction, SolautoError },
};

pub struct SolautoManagerAccounts<'a, 'b> {
    pub debt_token_mint: Option<&'a AccountInfo<'a>>,
    pub debt_token_account: Option<&'a AccountInfo<'a>>,
    pub solauto_fee_receiver: &'a AccountInfo<'a>,
    pub solauto_position: &'b DeserializedAccount<'a, Position>,
}

pub struct SolautoManager<'b> {
    client: &'b dyn LendingProtocolClient,
    obligation_position: &'b mut LendingProtocolObligationPosition,
    // TODO
    // accounts: SolautoManagerAccounts<'a>,
}

impl<'b> SolautoManager<'b> {
    pub fn from(
        client: &'b dyn LendingProtocolClient,
        obligation_position: &'b mut LendingProtocolObligationPosition
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
        // TODO: we should prepare for if borrow value is so high that it brings utilization rate above a value where the lending protocol will reject the borrow
        // in which case we need to do this over multiple borrows and deposits in a row

        let debt = self.obligation_position.debt.as_ref().unwrap();

        let debt_adjustment_usd = calculate_debt_adjustment_usd(
            self.obligation_position.open_ltv,
            self.obligation_position.supply.as_ref().unwrap().amount_used.usd_value as f64,
            self.obligation_position.debt.as_ref().unwrap().amount_used.usd_value as f64,
            target_utilization_rate_bps,
            Some(SOLAUTO_BOOST_FEE_BPS)
        );

        let buffer_room_from_cap = 0.9;
        let borrow_cap_usd = debt.amount_can_be_used.usd_value * buffer_room_from_cap;
        let borrow_value_usd = if debt_adjustment_usd < borrow_cap_usd {
            debt_adjustment_usd
        } else {
            msg!("Capped at borrowing only {} USD value of debt during leverage increase", borrow_cap_usd);
            borrow_cap_usd
        };
        let solauto_fee_usd = borrow_cap_usd.mul((SOLAUTO_BOOST_FEE_BPS as f64).div(10000.0));

        let borrow_value_base_unit = to_base_unit::<f64, u8, u64>(
            borrow_value_usd.div(debt.market_price),
            debt.decimals
        );
        let solauto_value_base_unit = to_base_unit::<f64, u8, u64>(
            solauto_fee_usd.div(debt.market_price),
            debt.decimals
        );
        self.borrow(borrow_value_base_unit + solauto_value_base_unit)?;

        // TODO Swap borrow_value_base_unit to supply token mint
        // TODO Deposit supply token

        self.payout_solauto_fee()
    }

    fn decrease_leverage(&mut self, target_utilization_rate_bps: u16) -> ProgramResult {
        // TODO: if we are unable to rebalance to desired position due to borrow / withdraw caps, we should expect a flash loan to have filled required amount
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

    fn payout_solauto_fee(&self) -> ProgramResult {
        // TODO create setting to manage the token in which to receive fees
        // swap solauto_fee = solauto_fee_value_usd * debt_market_price to the fee_receiver_token
        // send solauto fee to solauto fee receiver address
        Ok(())
    }
}
