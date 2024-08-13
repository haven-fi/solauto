use math_utils::{from_base_unit, from_bps};
use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, msg,
    program_error::ProgramError, sysvar::Sysvar,
};
use solana_utils::spl_token_transfer;
use std::{
    cmp::min,
    ops::{Add, Div, Mul, Sub},
};

use super::{
    instruction::{RebalanceSettings, SolautoAction, SolautoStandardAccounts},
    lending_protocol::{LendingProtocolClient, LendingProtocolTokenAccounts},
    shared::{FeeType, RefreshStateProps, SolautoError, TokenBalanceAmount, TokenType},
};
use crate::{
    constants::DEFAULT_LIMIT_GAP_BPS,
    state::solauto_position::{
        AutomationSettings, RebalanceData, SolautoPosition, SolautoRebalanceType,
    },
    utils::*,
};

pub struct SolautoManagerAccounts<'a> {
    pub supply: LendingProtocolTokenAccounts<'a>,
    pub debt: LendingProtocolTokenAccounts<'a>,
    pub intermediary_ta: Option<&'a AccountInfo<'a>>,
}
impl<'a> SolautoManagerAccounts<'a> {
    pub fn from(
        supply: LendingProtocolTokenAccounts<'a>,
        debt: LendingProtocolTokenAccounts<'a>,
        intermediary_ta: Option<&'a AccountInfo<'a>>,
    ) -> Result<Self, ProgramError> {
        Ok(Self {
            supply,
            debt,
            intermediary_ta,
        })
    }
}

pub struct SolautoManager<'a> {
    pub client: Box<dyn LendingProtocolClient<'a> + 'a>,
    pub accounts: Box<SolautoManagerAccounts<'a>>,
    pub std_accounts: Box<SolautoStandardAccounts<'a>>,
    pub solauto_fees_bps: solauto_utils::SolautoFeesBps,
}

impl<'a> SolautoManager<'a> {
    pub fn from(
        client: Box<dyn LendingProtocolClient<'a> + 'a>,
        accounts: Box<SolautoManagerAccounts<'a>>,
        std_accounts: Box<SolautoStandardAccounts<'a>>,
    ) -> Result<Self, ProgramError> {
        client.validate(&std_accounts)?;
        let solauto_fees_bps = solauto_utils::get_solauto_fees_bps(
            std_accounts.referred_by_supply_ta.is_some(),
            std_accounts.solauto_position.data.fee_type,
        );
        Ok(Self {
            client,
            accounts,
            std_accounts,
            solauto_fees_bps,
        })
    }

    fn deposit(&mut self, base_unit_amount: u64) -> ProgramResult {
        self.update_usage(base_unit_amount as i64, TokenType::Supply);
        self.client.deposit(base_unit_amount, &self.std_accounts)?;
        Ok(())
    }

    fn borrow(&mut self, base_unit_amount: u64, destination: &'a AccountInfo<'a>) -> ProgramResult {
        self.update_usage(base_unit_amount as i64, TokenType::Debt);
        self.client
            .borrow(base_unit_amount, destination, &self.std_accounts)?;
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

        self.update_usage((base_unit_amount as i64) * -1, TokenType::Supply);
        self.client
            .withdraw(amount, destination, &self.std_accounts)?;
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

        self.update_usage((base_unit_amount as i64) * -1, TokenType::Debt);
        self.client.repay(amount, &self.std_accounts)?;
        Ok(())
    }

    fn update_usage(&mut self, base_unit_amount: i64, token_type: TokenType) {
        if self.std_accounts.solauto_position.data.position.is_some()
            || self.std_accounts.solauto_position.data.rebalance.active()
        {
            self.std_accounts
                .solauto_position
                .data
                .update_usage(token_type, base_unit_amount);
        }
    }

    pub fn protocol_interaction(&mut self, action: SolautoAction) -> ProgramResult {
        match action {
            SolautoAction::Deposit(base_unit_amount) => {
                self.deposit(base_unit_amount)?;
            }
            SolautoAction::Borrow(base_unit_amount) => {
                self.borrow(
                    base_unit_amount,
                    self.accounts
                        .debt
                        .position_ta
                        .as_ref()
                        .unwrap()
                        .account_info,
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
                        .position_ta
                        .as_ref()
                        .unwrap()
                        .account_info,
                )?;
            }
        }
        Ok(())
    }

    pub fn begin_rebalance(&mut self, rebalance_args: &RebalanceSettings) -> ProgramResult {
        let (debt_adjustment_usd, amount_to_dca_in) = rebalance_utils::get_rebalance_values(
            &mut self.std_accounts.solauto_position.data,
            rebalance_args,
            &self.solauto_fees_bps,
            Clock::get()?.unix_timestamp as u64,
        )?;

        if amount_to_dca_in.is_some() {
            solana_utils::spl_token_transfer(
                self.std_accounts.token_program,
                self.accounts
                    .debt
                    .position_ta
                    .as_ref()
                    .unwrap()
                    .account_info,
                self.std_accounts.solauto_position.account_info,
                self.accounts.intermediary_ta.unwrap(),
                amount_to_dca_in.unwrap(),
                Some(&self.std_accounts.solauto_position.data.seeds_with_bump()),
            )?;
        }

        if self
            .std_accounts
            .solauto_position
            .data
            .rebalance
            .rebalance_type
            == SolautoRebalanceType::DoubleRebalanceWithFL
        {
            self.validate_flash_loan_amount(
                self.std_accounts
                    .solauto_position
                    .data
                    .rebalance
                    .flash_loan_amount,
                debt_adjustment_usd,
            )?;
            return Ok(());
        }

        let increasing_leverage = debt_adjustment_usd > 0.0;

        let token = if increasing_leverage {
            Box::new(&self.std_accounts.solauto_position.data.state.debt)
        } else {
            Box::new(&self.std_accounts.solauto_position.data.state.supply)
        };

        let base_unit_amount = math_utils::to_base_unit::<f64, u8, u64>(
            debt_adjustment_usd.abs().div(token.market_price()),
            token.decimals,
        );

        let limit_gap = if rebalance_args.limit_gap_bps.is_some() {
            from_bps(rebalance_args.limit_gap_bps.unwrap())
        } else {
            from_bps(DEFAULT_LIMIT_GAP_BPS)
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
                    self.std_accounts
                        .solauto_position
                        .data
                        .state
                        .supply
                        .amount_used
                        .base_unit,
                    base_unit_amount,
                )),
                self.accounts.intermediary_ta.unwrap(),
            )
        }
    }

    pub fn finish_rebalance(&mut self, rebalance_args: &RebalanceSettings) -> ProgramResult {
        let rebalance_data = &self.std_accounts.solauto_position.data.rebalance;
        let rebalance_type = rebalance_data.rebalance_type;
        let flash_loan_amount = rebalance_data.flash_loan_amount;

        if rebalance_type == SolautoRebalanceType::SingleRebalanceWithFL {
            let (debt_adjustment_usd, _) = rebalance_utils::get_rebalance_values(
                &mut self.std_accounts.solauto_position.data,
                rebalance_args,
                &self.solauto_fees_bps,
                Clock::get()?.unix_timestamp as u64,
            )?;
            self.validate_flash_loan_amount(flash_loan_amount, debt_adjustment_usd)?;
        }

        let position_supply_ta = self.accounts.supply.position_ta.as_ref().unwrap();
        let position_debt_ta = self.accounts.debt.position_ta.as_ref().unwrap();

        let available_supply_balance = position_supply_ta.data.amount;

        let available_debt_balance = if self.std_accounts.solauto_position.data.self_managed.val {
            position_debt_ta.data.amount
        } else {
            position_debt_ta.data.amount
                - self
                    .std_accounts
                    .solauto_position
                    .data
                    .position
                    .dca
                    .debt_to_add_base_unit
        };

        let transfer_to_signer_ta = |token_accounts: &LendingProtocolTokenAccounts<'a>,
                                     amount: u64| {
            spl_token_transfer(
                self.std_accounts.token_program,
                token_accounts.position_ta.clone().unwrap().account_info,
                self.std_accounts.solauto_position.account_info,
                token_accounts.signer_ta.clone().unwrap().account_info,
                amount,
                Some(&self.std_accounts.solauto_position.data.seeds_with_bump()),
            )
        };

        let boosting = available_supply_balance > 0;
        if boosting {
            let amount_after_fees = self.payout_fees(available_supply_balance)?;
            if self.std_accounts.solauto_position.data.self_managed.val {
                transfer_to_signer_ta(&self.accounts.supply, amount_after_fees)?;
            }
            self.deposit(amount_after_fees)?;
        } else if available_debt_balance > 0 {
            let amount = if self
                .std_accounts
                .solauto_position
                .data
                .rebalance
                .target_liq_utilization_rate_bps
                == 0
            {
                TokenBalanceAmount::All
            } else {
                TokenBalanceAmount::Some(min(
                    self.std_accounts
                        .solauto_position
                        .data
                        .state
                        .debt
                        .amount_used
                        .base_unit,
                    available_debt_balance,
                ))
            };
            if self.std_accounts.solauto_position.data.self_managed.val {
                transfer_to_signer_ta(&self.accounts.debt, available_debt_balance)?;
            }
            self.repay(amount)?;
        } else {
            msg!("Missing required position liquidity to rebalance position");
            return Err(SolautoError::UnableToReposition.into());
        }

        if flash_loan_amount > 0 {
            let flash_loan_fee_bps = if boosting {
                self.std_accounts
                    .solauto_position
                    .data
                    .state
                    .supply
                    .flash_loan_fee_bps
            } else {
                self.std_accounts
                    .solauto_position
                    .data
                    .state
                    .debt
                    .flash_loan_fee_bps
            };
            let final_amount = flash_loan_amount
                .add((flash_loan_amount as f64).mul(from_bps(flash_loan_fee_bps)) as u64);
            if boosting {
                self.borrow(final_amount, self.accounts.intermediary_ta.unwrap())?;
            } else {
                self.withdraw(
                    TokenBalanceAmount::Some(final_amount),
                    self.accounts.intermediary_ta.unwrap(),
                )?;
            }
        }

        self.std_accounts.solauto_position.data.rebalance = RebalanceData::default();
        if !self.std_accounts.solauto_position.data.self_managed.val {
            self.std_accounts.solauto_position.data.fee_type = FeeType::Default;
        }
        Ok(())
    }

    fn payout_fees(&self, total_available_balance: u64) -> Result<u64, ProgramError> {
        if self.std_accounts.authority_referral_state.is_none() {
            msg!(
                "Missing referral account when we are boosting leverage. Referral accounts are required"
            );
            return Err(SolautoError::IncorrectAccounts.into());
        }

        let position_supply_ta = &self.accounts.supply.position_ta.as_ref().unwrap();

        let solauto_fees =
            (total_available_balance as f64).mul(from_bps(self.solauto_fees_bps.solauto)) as u64;

        solana_utils::spl_token_transfer(
            self.std_accounts.token_program,
            position_supply_ta.account_info,
            self.std_accounts.solauto_position.account_info,
            self.std_accounts.solauto_fees_supply_ta.unwrap(),
            solauto_fees,
            Some(&self.std_accounts.solauto_position.data.seeds_with_bump()),
        )?;

        let referrer_fees =
            (total_available_balance as f64).mul(from_bps(self.solauto_fees_bps.referrer)) as u64;

        if referrer_fees > 0 {
            solana_utils::spl_token_transfer(
                self.std_accounts.token_program,
                position_supply_ta.account_info,
                self.std_accounts.solauto_position.account_info,
                self.std_accounts.referred_by_supply_ta.unwrap(),
                referrer_fees,
                Some(&self.std_accounts.solauto_position.data.seeds_with_bump()),
            )?;
        }

        Ok(total_available_balance - solauto_fees - referrer_fees)
    }

    fn validate_flash_loan_amount(
        &self,
        base_unit_amount: u64,
        expected_debt_adjustment_usd: f64,
    ) -> ProgramResult {
        let amount_usd = if expected_debt_adjustment_usd > 0.0 {
            from_base_unit::<u64, u8, f64>(
                base_unit_amount,
                self.std_accounts.solauto_position.data.state.debt.decimals,
            )
            .mul(
                self.std_accounts
                    .solauto_position
                    .data
                    .state
                    .debt
                    .market_price(),
            )
        } else {
            from_base_unit::<u64, u8, f64>(
                base_unit_amount,
                self.std_accounts
                    .solauto_position
                    .data
                    .state
                    .supply
                    .decimals,
            )
            .mul(
                self.std_accounts
                    .solauto_position
                    .data
                    .state
                    .supply
                    .market_price(),
            )
        };

        // Checking if within 15% range due to varying price volatility
        if (amount_usd - expected_debt_adjustment_usd.abs())
            .abs()
            .div(amount_usd)
            > 0.15
        {
            msg!(
                "Flash loan amount was not what was expected ({} vs. {})",
                amount_usd.abs(),
                expected_debt_adjustment_usd.abs()
            );
            return Err(ProgramError::InvalidInstructionData.into());
        }

        Ok(())
    }

    pub fn refresh_position(
        solauto_position: &mut SolautoPosition,
        updated_data: RefreshStateProps,
        clock: Clock,
    ) -> ProgramResult {
        solauto_position.state.max_ltv_bps = updated_data.max_ltv.mul(10000.0) as u16;
        solauto_position.state.liq_threshold_bps = updated_data.liq_threshold.mul(10000.0) as u16;

        solauto_position.state.supply.decimals = updated_data.supply.decimals;
        solauto_position.state.debt.decimals = updated_data.debt.decimals;

        solauto_position.state.supply.amount_used.base_unit = updated_data.supply.amount_used;
        solauto_position.state.supply.amount_can_be_used.base_unit =
            updated_data.supply.amount_can_be_used;
        solauto_position
            .state
            .supply
            .update_market_price(updated_data.supply.market_price);

        solauto_position.state.debt.amount_used.base_unit = updated_data.debt.amount_used;
        solauto_position.state.debt.amount_can_be_used.base_unit =
            updated_data.debt.amount_can_be_used;
        solauto_position
            .state
            .debt
            .update_market_price(updated_data.debt.market_price);

        solauto_position.state.net_worth.base_unit = math_utils::net_worth_base_amount(
            solauto_position.state.supply.amount_used.usd_value(),
            solauto_position.state.debt.amount_used.usd_value(),
            solauto_position.state.supply.market_price(),
            solauto_position.state.supply.decimals,
        );
        solauto_position.state.net_worth.update_usd_value(
            updated_data.supply.market_price,
            solauto_position.state.supply.decimals,
        );

        solauto_position.refresh_state();
        solauto_position.state.last_updated = clock.unix_timestamp as u64;

        if solauto_position.self_managed.val {
            return Ok(());
        }

        if solauto_position
            .position
            .setting_params
            .automation
            .is_active()
        {
            let automation = &solauto_position.position.setting_params.automation;

            if automation.eligible_for_next_period(clock.unix_timestamp as u64) {
                let current_timestamp = Clock::get()?.unix_timestamp as u64;
                solauto_position.position.setting_params.boost_to_bps = automation
                    .updated_amount_from_automation(
                        solauto_position.position.setting_params.boost_to_bps,
                        solauto_position.position.setting_params.target_boost_to_bps,
                        current_timestamp,
                    );

                let new_periods_passed = automation.new_periods_passed(current_timestamp);
                if new_periods_passed == automation.target_periods {
                    solauto_position.position.setting_params.automation =
                        AutomationSettings::default();
                    solauto_position.position.setting_params.target_boost_to_bps = 0;
                } else {
                    solauto_position
                        .position
                        .setting_params
                        .automation
                        .periods_passed = new_periods_passed;
                }
            }
        }

        Ok(())
    }
}
