use std::ops::{Div, Mul};

use solana_program::{entrypoint::ProgramResult, msg, program_error::ProgramError};

use crate::{
    constants::SOLAUTO_BOOST_FEE_BPS,
    utils::math_utils::{calculate_debt_adjustment_usd, to_base_unit},
};

use super::{
    instruction::{SolautoAction, SolautoStandardAccounts, WithdrawParams},
    lending_protocol::LendingProtocolClient,
    obligation_position::LendingProtocolObligationPosition,
    shared::{DeserializedAccount, Position, SolautoError, SolautoRebalanceStep},
};

// pub struct SolautoManagerAccounts<'a> {
//  pub debt_token_mint: Option<&'a AccountInfo<'a>>,
//  pub debt_token_account: Option<&'a AccountInfo<'a>>,
// }

pub struct SolautoManager<'a, 'b> {
    pub client: &'b dyn LendingProtocolClient<'a>,
    pub obligation_position: &'b mut LendingProtocolObligationPosition,
    pub std_accounts: SolautoStandardAccounts<'a>,
}

impl<'a, 'b> SolautoManager<'a, 'b> {
    pub fn from(
        client: &'b dyn LendingProtocolClient<'a>,
        obligation_position: &'b mut LendingProtocolObligationPosition,
        std_accounts: SolautoStandardAccounts<'a>,
    ) -> Result<Self, ProgramError> {
        client.validate(&std_accounts)?;
        Ok(Self {
            client,
            obligation_position,
            std_accounts,
        })
    }

    pub fn protocol_interaction(&mut self, action: SolautoAction) -> ProgramResult {
        match action {
            SolautoAction::Deposit(base_unit_amount) => {
                self.deposit(base_unit_amount)?;
            }
            SolautoAction::Borrow(base_unit_amount) => {
                self.borrow(base_unit_amount)?;
            }
            SolautoAction::Repay(base_unit_amount) => {
                self.repay(base_unit_amount)?;
            }
            SolautoAction::Withdraw(params) => match params {
                WithdrawParams::All => {
                    self.withdraw(self.obligation_position.net_worth_base_amount())?
                }
                WithdrawParams::Partial(base_unit_amount) => self.withdraw(base_unit_amount)?,
            },
        }

        if self.obligation_position.current_liq_utilization_rate_bps() > 10000 {
            return Err(SolautoError::ExceededValidUtilizationRate.into());
        }

        Ok(())
    }

    fn deposit(&mut self, base_unit_amount: u64) -> ProgramResult {
        self.client.deposit(base_unit_amount, &self.std_accounts)?;
        self.obligation_position
            .supply_lent_update(base_unit_amount as i64)
    }

    fn borrow(&mut self, base_unit_amount: u64) -> ProgramResult {
        self.client.borrow(base_unit_amount, &self.std_accounts)?;
        self.obligation_position
            .debt_borrowed_update(base_unit_amount as i64)
    }

    fn withdraw(&mut self, base_unit_amount: u64) -> ProgramResult {
        self.client.withdraw(base_unit_amount, &self.std_accounts)?;
        self.obligation_position
            .supply_lent_update((base_unit_amount as i64) * -1)
    }

    fn repay(&mut self, base_unit_amount: u64) -> ProgramResult {
        self.client.repay(base_unit_amount, &self.std_accounts)?;
        self.obligation_position
            .debt_borrowed_update((base_unit_amount as i64) * -1)
    }

    pub fn rebalance(&mut self, target_liq_utilization_rate_bops: u16, rebalance_step: SolautoRebalanceStep) -> ProgramResult {
        // TODO
        Ok(())
    }

    // pub fn rebalance(&mut self, target_liq_utilization_rate_bps: u16) -> ProgramResult {
    //     if self.obligation_position.current_liq_utilization_rate_bps()
    //         < target_liq_utilization_rate_bps
    //     {
    //         self.increase_leverage(target_liq_utilization_rate_bps)
    //     } else {
    //         self.decrease_leverage(target_liq_utilization_rate_bps)
    //     }
    // }

    // fn increase_leverage(&mut self, target_liq_utilization_rate_bps: u16) -> ProgramResult {
    //     let debt = self.obligation_position.debt.as_ref().unwrap();

    //     let debt_adjustment_usd = calculate_debt_adjustment_usd(
    //         self.obligation_position.liq_threshold,
    //         self.obligation_position
    //             .supply
    //             .as_ref()
    //             .unwrap()
    //             .amount_used
    //             .usd_value as f64,
    //         self.obligation_position
    //             .debt
    //             .as_ref()
    //             .unwrap()
    //             .amount_used
    //             .usd_value as f64,
    //         target_liq_utilization_rate_bps,
    //         Some(SOLAUTO_BOOST_FEE_BPS),
    //     );
    //     // TODO: get complete_debt_adjustment_usd based on the max_slippage_bps (TOD we need to add)

    //     let buffer_room_from_cap = 0.9;
    //     let borrow_cap_usd = debt.amount_can_be_used.usd_value * buffer_room_from_cap;
    //     let borrow_value_usd = if debt_adjustment_usd < borrow_cap_usd {
    //         debt_adjustment_usd
    //     } else {
    //         msg!(
    //             "Capped at borrowing only {} USD value of debt during leverage increase",
    //             borrow_cap_usd
    //         );
    //         borrow_cap_usd
    //     };
    //     let solauto_fee_usd = borrow_cap_usd.mul((SOLAUTO_BOOST_FEE_BPS as f64).div(10000.0));

    //     let borrow_value_base_unit =
    //         to_base_unit::<f64, u8, u64>(borrow_value_usd.div(debt.market_price), debt.decimals);
    //     let solauto_value_base_unit =
    //         to_base_unit::<f64, u8, u64>(solauto_fee_usd.div(debt.market_price), debt.decimals);
    //     self.borrow(borrow_value_base_unit + solauto_value_base_unit)?;

    //     self.payout_solauto_fee()
    // }

    // fn decrease_leverage(&mut self, target_liq_utilization_rate_bps: u16) -> ProgramResult {
    //     // TODO: if we are unable to rebalance to desired position due to borrow / withdraw caps, we should expect a flash loan to have filled required amount
    //     Ok(())
    // }

    pub fn refresh_position(
        obligation_position: &LendingProtocolObligationPosition,
        solauto_position: &mut Option<DeserializedAccount<Position>>,
    ) {
        if solauto_position.is_none() {
            return;
        }

        let position = solauto_position.as_mut().unwrap();

        position.data.general_data.net_worth_usd_base_amount =
            obligation_position.net_worth_usd_base_amount();
        position.data.general_data.base_amount_liquidity_net_worth =
            obligation_position.net_worth_base_amount();
        position.data.general_data.liq_utilization_rate_bps =
            obligation_position.current_liq_utilization_rate_bps();
        position.data.general_data.base_amount_supplied = if !obligation_position.supply.is_none() {
            obligation_position
                .supply
                .as_ref()
                .unwrap()
                .amount_used
                .base_unit
        } else {
            0
        };
        position.data.general_data.base_amount_supplied = if !obligation_position.debt.is_none() {
            obligation_position
                .debt
                .as_ref()
                .unwrap()
                .amount_used
                .base_unit
        } else {
            0
        };
    }

    fn payout_solauto_fee(&self) -> ProgramResult {
        // TODO create setting to manage the token in which to receive fees
        // swap solauto_fee = solauto_fee_value_usd * debt_market_price to the fee_receiver_token
        // send solauto fee to solauto fee receiver address
        Ok(())
    }
}
