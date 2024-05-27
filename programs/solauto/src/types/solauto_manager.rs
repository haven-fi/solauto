use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, msg,
    program_error::ProgramError, sysvar::Sysvar,
};
use std::{
    cmp::min,
    ops::{Div, Mul, Sub},
};

use super::{
    instruction::{RebalanceData, SolautoAction, SolautoStandardAccounts},
    lending_protocol::{LendingProtocolClient, LendingProtocolTokenAccounts},
    shared::{RefreshStateProps, SolautoError, SolautoRebalanceStep, TokenBalanceAmount},
    solauto_position::SolautoPosition,
};
use crate::utils::*;

pub struct SolautoManagerAccounts<'a> {
    pub supply: Option<LendingProtocolTokenAccounts<'a>>,
    pub debt: Option<LendingProtocolTokenAccounts<'a>>,
    pub intermediary_ta: Option<&'a AccountInfo<'a>>,
}
impl<'a> SolautoManagerAccounts<'a> {
    pub fn from(
        position_supply_ta: Option<&'a AccountInfo<'a>>,
        protocol_supply_ta: Option<&'a AccountInfo<'a>>,
        position_debt_ta: Option<&'a AccountInfo<'a>>,
        protocol_debt_ta: Option<&'a AccountInfo<'a>>,
        intermediary_ta: Option<&'a AccountInfo<'a>>,
    ) -> Result<Self, ProgramError> {
        let supply =
            LendingProtocolTokenAccounts::from(None, position_supply_ta, protocol_supply_ta)?;
        let debt = LendingProtocolTokenAccounts::from(None, position_debt_ta, protocol_debt_ta)?;
        Ok(Self {
            supply,
            debt,
            intermediary_ta,
        })
    }
}

pub struct SolautoManager<'a, 'b> {
    pub client: &'b dyn LendingProtocolClient<'a>,
    pub accounts: SolautoManagerAccounts<'a>,
    pub std_accounts: SolautoStandardAccounts<'a>,
    pub solauto_fees_bps: solauto_utils::SolautoFeesBps,
}

impl<'a, 'b> SolautoManager<'a, 'b> {
    pub fn from(
        client: &'b dyn LendingProtocolClient<'a>,
        accounts: SolautoManagerAccounts<'a>,
        std_accounts: SolautoStandardAccounts<'a>,
    ) -> Result<Self, ProgramError> {
        client.validate(&std_accounts)?;
        let solauto_fees_bps =
            solauto_utils::SolautoFeesBps::get(std_accounts.referred_by_supply_ta.is_some());
        Ok(Self {
            client,
            accounts,
            std_accounts,
            solauto_fees_bps,
        })
    }

    pub fn protocol_interaction(&mut self, action: SolautoAction) -> ProgramResult {
        match action {
            SolautoAction::Deposit(base_unit_amount) => {
                self.deposit(base_unit_amount)?;
            }
            SolautoAction::Borrow(base_unit_amount) => {
                self.borrow(
                    base_unit_amount,
                    self.accounts.debt.as_ref().unwrap().source_ta.account_info,
                )?;
            }
            SolautoAction::Repay(amount) => {
                self.repay(amount)?;
            }
            SolautoAction::Withdraw(amount) => {
                self.withdraw(
                    amount,
                    self.accounts
                        .supply
                        .as_ref()
                        .unwrap()
                        .source_ta
                        .account_info,
                )?;
            }
        }
        Ok(())
    }

    fn deposit(&mut self, base_unit_amount: u64) -> ProgramResult {
        self.client.deposit(base_unit_amount, &self.std_accounts)?;
        self.std_accounts
            .solauto_position
            .data
            .state
            .supply
            .update_usage(base_unit_amount as i64);
        Ok(())
    }

    fn borrow(&mut self, base_unit_amount: u64, destination: &'a AccountInfo<'a>) -> ProgramResult {
        self.client
            .borrow(base_unit_amount, destination, &self.std_accounts)?;
        self.std_accounts
            .solauto_position
            .data
            .state
            .debt
            .update_usage(base_unit_amount as i64);
        Ok(())
    }

    fn withdraw(
        &mut self,
        amount: TokenBalanceAmount,
        destination: &'a AccountInfo<'a>,
    ) -> ProgramResult {
        let base_unit_amount = match amount {
            TokenBalanceAmount::All => {
                self.std_accounts
                    .solauto_position
                    .data
                    .state
                    .supply
                    .amount_used
                    .base_unit
            }
            TokenBalanceAmount::Some(num) => num,
        };

        self.client
            .withdraw(amount, destination, &self.std_accounts)?;
        self.std_accounts
            .solauto_position
            .data
            .state
            .supply
            .update_usage((base_unit_amount as i64) * -1);
        Ok(())
    }

    fn repay(&mut self, amount: TokenBalanceAmount) -> ProgramResult {
        let base_unit_amount = match amount {
            TokenBalanceAmount::All => {
                self.std_accounts
                    .solauto_position
                    .data
                    .state
                    .debt
                    .amount_used
                    .base_unit
            }
            TokenBalanceAmount::Some(num) => num,
        };

        self.client.repay(amount, &self.std_accounts)?;
        self.std_accounts
            .solauto_position
            .data
            .state
            .supply
            .update_usage((base_unit_amount as i64) * -1);
        Ok(())
    }

    pub fn rebalance(
        &mut self,
        rebalance_args: RebalanceData,
        rebalance_step: SolautoRebalanceStep,
    ) -> ProgramResult {
        if rebalance_step == SolautoRebalanceStep::StartSolautoRebalanceSandwich
            || rebalance_step == SolautoRebalanceStep::StartMarginfiFlashLoanSandwich
        {
            self.begin_rebalance(&rebalance_args)
        } else if rebalance_step == SolautoRebalanceStep::FinishSolautoRebalanceSandwich
            || rebalance_step == SolautoRebalanceStep::FinishMarginfiFlashLoanSandwich
        {
            self.finish_rebalance()
        } else {
            // TODO (Kamino/Solend)
            msg!("Rebalance currently unsupported for this");
            return Err(SolautoError::InvalidRebalanceCondition.into());
        }
    }

    fn begin_rebalance(&mut self, rebalance_args: &RebalanceData) -> ProgramResult {
        let (debt_adjustment_usd, amount_to_dca_in) = rebalance_utils::get_rebalance_values(
            &mut self.std_accounts.solauto_position.data,
            rebalance_args,
            &self.solauto_fees_bps,
            Clock::get()?.unix_timestamp as u64,
        )?;

        if amount_to_dca_in.is_some() {
            solana_utils::spl_token_transfer(
                self.std_accounts.token_program,
                self.accounts.debt.as_ref().unwrap().source_ta.account_info,
                self.std_accounts.solauto_position.account_info,
                self.accounts.intermediary_ta.unwrap(),
                amount_to_dca_in.unwrap(),
                Some(&self.std_accounts.solauto_position.data.seeds_with_bump()),
            )?;
        }

        if debt_adjustment_usd.is_none() {
            return Ok(());
        }

        let increasing_leverage = debt_adjustment_usd.unwrap() > 0.0;

        let token = if increasing_leverage {
            &self.std_accounts.solauto_position.data.state.debt
        } else {
            &self.std_accounts.solauto_position.data.state.supply
        };

        let base_unit_amount = math_utils::to_base_unit::<f64, u8, u64>(
            debt_adjustment_usd.unwrap().div(token.market_price()),
            token.decimals,
        );

        let limit_gap = if rebalance_args.limit_gap_bps.is_some() {
            (rebalance_args.limit_gap_bps.unwrap() as f64).div(10000.0)
        } else {
            0.1
        };
        let pct_of_amount_can_be_used = (1.0).sub(limit_gap);

        if increasing_leverage {
            self.borrow(
                min(
                    base_unit_amount,
                    (token.amount_can_be_used.base_unit as f64).mul(pct_of_amount_can_be_used)
                        as u64,
                ),
                self.accounts.intermediary_ta.unwrap(),
            )
        } else {
            self.withdraw(
                TokenBalanceAmount::Some(min(
                    base_unit_amount,
                    (token.amount_can_be_used.base_unit as f64).mul(pct_of_amount_can_be_used)
                        as u64,
                )),
                self.accounts.intermediary_ta.unwrap(),
            )
        }
    }

    fn finish_rebalance(&mut self) -> ProgramResult {
        let position_supply_ta = &self.accounts.supply.as_ref().unwrap().source_ta.data;
        let position_debt_ta = &self.accounts.debt.as_ref().unwrap().source_ta.data;

        let available_supply_balance = position_supply_ta.amount;

        let available_debt_balance = if self.std_accounts.solauto_position.data.self_managed {
            position_debt_ta.amount
        } else {
            position_debt_ta.amount
                - self
                    .std_accounts
                    .solauto_position
                    .data
                    .position
                    .as_ref()
                    .unwrap()
                    .debt_ta_balance
        };

        if available_supply_balance > 0 {
            let amount_after_fees = self.payout_fees(available_supply_balance)?;
            self.deposit(amount_after_fees)?;
        } else if available_debt_balance > 0 {
            self.repay(TokenBalanceAmount::Some(available_debt_balance))?;
        } else {
            msg!("Missing required position liquidity to rebalance position");
            return Err(SolautoError::UnableToReposition.into());
        }

        Ok(())
    }

    fn payout_fees(&self, total_available_balance: u64) -> Result<u64, ProgramError> {
        if self.std_accounts.authority_referral_state.is_none()
            || self.std_accounts.referred_by_supply_ta.is_none()
        {
            msg!(
                "Missing referral account(s) when we are boosting leverage. Referral accounts are required"
            );
            return Err(SolautoError::IncorrectAccounts.into());
        }

        let position_supply_ta = &self.accounts.supply.as_ref().unwrap().source_ta;

        let solauto_fees = (total_available_balance as f64)
            .mul((self.solauto_fees_bps.solauto as f64).div(10000.0))
            as u64;

        solana_utils::spl_token_transfer(
            self.std_accounts.token_program,
            position_supply_ta.account_info,
            self.std_accounts.solauto_position.account_info,
            self.std_accounts
                .solauto_fees_supply_ta
                .as_ref()
                .unwrap()
                .account_info,
            solauto_fees,
            Some(&self.std_accounts.solauto_position.data.seeds_with_bump()),
        )?;

        let referrer_fees = (total_available_balance as f64)
            .mul((self.solauto_fees_bps.referrer as f64).div(10000.0))
            as u64;

        if referrer_fees > 0 {
            solana_utils::spl_token_transfer(
                self.std_accounts.token_program,
                position_supply_ta.account_info,
                self.std_accounts.solauto_position.account_info,
                self.std_accounts
                    .referred_by_supply_ta
                    .as_ref()
                    .unwrap()
                    .account_info,
                referrer_fees,
                Some(&self.std_accounts.solauto_position.data.seeds_with_bump()),
            )?;
        }

        Ok(total_available_balance - solauto_fees)
    }

    pub fn refresh_position(
        solauto_position: &mut Box<SolautoPosition>,
        updated_data: RefreshStateProps,
        clock: Clock,
    ) {
        solauto_position.state.max_ltv_bps = updated_data.max_ltv.mul(10000.0) as u16;
        solauto_position.state.liq_threshold_bps = updated_data.liq_threshold.mul(10000.0) as u16;

        solauto_position.state.supply.decimals = updated_data.supply.decimals;
        solauto_position.state.supply.amount_used.base_unit = updated_data.supply.amount_used;
        solauto_position.state.supply.amount_can_be_used.base_unit =
            updated_data.supply.amount_can_be_used;
        solauto_position
            .state
            .supply
            .update_market_price(updated_data.supply.market_price);

        solauto_position.state.debt.decimals = updated_data.debt.decimals;
        solauto_position.state.debt.amount_used.base_unit = updated_data.debt.amount_used;
        solauto_position.state.debt.amount_can_be_used.base_unit =
            updated_data.debt.amount_can_be_used;
        solauto_position
            .state
            .debt
            .update_market_price(updated_data.debt.market_price);

        solauto_position.state.net_worth_base_amount_usd = math_utils::net_worth_usd_base_amount(
            solauto_position.state.supply.amount_used.usd_value(),
            solauto_position.state.debt.amount_used.usd_value(),
        );
        solauto_position.state.net_worth_base_amount_supply_mint =
            math_utils::net_worth_base_amount(
                solauto_position.state.supply.amount_used.usd_value(),
                solauto_position.state.debt.amount_used.usd_value(),
                solauto_position.state.supply.market_price(),
                solauto_position.state.supply.decimals,
            );

        solauto_position.refresh_liq_utilization_rate_bps();
        solauto_position.state.last_updated = clock.unix_timestamp as u64;

        if solauto_position.self_managed {
            return;
        }

        let position = solauto_position.position.as_mut().unwrap();
        if position.setting_params.target_boost_to_bps.is_some() {
            let automation = position.setting_params.automation.as_mut().unwrap();

            if automation.eligible_for_next_period(clock.unix_timestamp as u64) {
                position.setting_params.boost_to_bps = automation
                    .updated_amount_from_automation(
                        position.setting_params.boost_to_bps,
                        position.setting_params.target_boost_to_bps.unwrap(),
                    )
                    .unwrap();
            }

            if automation.periods_passed == automation.target_periods - 1 {
                position.setting_params.automation = None;
                position.setting_params.target_boost_to_bps = None;
            } else {
                automation.periods_passed += 1;
            }
        }
    }
}
