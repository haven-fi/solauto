use math_utils::{ from_bps, to_bps };
use solana_program::{
    account_info::AccountInfo,
    clock::Clock,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    sysvar::Sysvar,
};
use spl_associated_token_account::get_associated_token_address;
use std::{ cmp::min, ops::{ Add, Div, Mul } };
use validation_utils::validate_debt_adjustment;

use super::{
    instruction::{ RebalanceSettings, SolautoAction, SolautoStandardAccounts },
    lending_protocol::{ LendingProtocolClient, LendingProtocolTokenAccounts },
    shared::{
        RebalanceDirection,
        RefreshStateProps,
        RefreshedTokenState,
        SolautoError,
        TokenBalanceAmount,
        TokenType,
    },
    solana::SplTokenTransferArgs,
};
use crate::{
    constants::SOLAUTO_FEES_WALLET,
    state::solauto_position::{ RebalanceData, SolautoPosition, SolautoRebalanceType },
    utils::*,
};

pub struct SolautoManagerAccounts<'a> {
    pub supply: LendingProtocolTokenAccounts<'a>,
    pub debt: LendingProtocolTokenAccounts<'a>,
    pub intermediary_ta: Option<&'a AccountInfo<'a>>,
    pub solauto_fees: Option<solauto_utils::SolautoFeesBps>,
}
impl<'a> SolautoManagerAccounts<'a> {
    pub fn from(
        supply: LendingProtocolTokenAccounts<'a>,
        debt: LendingProtocolTokenAccounts<'a>,
        intermediary_ta: Option<&'a AccountInfo<'a>>,
        solauto_fees: Option<solauto_utils::SolautoFeesBps>
    ) -> Result<Self, ProgramError> {
        Ok(Self {
            supply,
            debt,
            intermediary_ta,
            solauto_fees,
        })
    }
}

pub struct SolautoManager<'a> {
    pub client: Box<dyn LendingProtocolClient<'a> + 'a>,
    pub accounts: SolautoManagerAccounts<'a>,
    pub std_accounts: Box<SolautoStandardAccounts<'a>>,
    pub solauto_fees_bps: Option<solauto_utils::SolautoFeesBps>,
}

impl<'a> SolautoManager<'a> {
    pub fn from(
        client: Box<dyn LendingProtocolClient<'a> + 'a>,
        accounts: SolautoManagerAccounts<'a>,
        std_accounts: Box<SolautoStandardAccounts<'a>>,
        solauto_fees_bps: Option<solauto_utils::SolautoFeesBps>
    ) -> Result<Self, ProgramError> {
        client.validate(&std_accounts)?;
        Ok(Self {
            client,
            accounts,
            std_accounts,
            solauto_fees_bps,
        })
    }

    fn position_data(&self) -> &SolautoPosition {
        &self.std_accounts.solauto_position.data
    }

    fn position_data_mut(&mut self) -> &mut SolautoPosition {
        &mut self.std_accounts.solauto_position.data
    }

    fn rebalance_data(&self) -> &RebalanceData {
        &self.std_accounts.solauto_position.data.rebalance
    }

    fn get_seeds_with_bump(&self) -> Vec<&[u8]> {
        self.position_data().seeds_with_bump()
    }

    fn deposit(&mut self, base_unit_amount: u64) -> ProgramResult {
        msg!("Depositing {}", base_unit_amount);
        self.update_usage(base_unit_amount as i64, TokenType::Supply);
        self.client.deposit(base_unit_amount, &self.std_accounts)?;
        Ok(())
    }

    fn borrow(&mut self, base_unit_amount: u64, destination: &'a AccountInfo<'a>) -> ProgramResult {
        msg!("Borrowing {}", base_unit_amount);
        self.update_usage(base_unit_amount as i64, TokenType::Debt);
        self.client.borrow(base_unit_amount, destination, &self.std_accounts)?;
        Ok(())
    }

    fn withdraw(
        &mut self,
        amount: TokenBalanceAmount,
        destination: &'a AccountInfo<'a>
    ) -> ProgramResult {
        let base_unit_amount = match amount {
            TokenBalanceAmount::All => self.position_data().state.supply.amount_used.base_unit,
            TokenBalanceAmount::Some(num) => num,
        };

        msg!("Withdrawing {}", base_unit_amount);
        self.update_usage((base_unit_amount as i64) * -1, TokenType::Supply);
        self.client.withdraw(amount, destination, &self.std_accounts)?;
        Ok(())
    }

    fn repay(&mut self, amount: TokenBalanceAmount) -> ProgramResult {
        let base_unit_amount = match amount {
            TokenBalanceAmount::All => self.position_data().state.debt.amount_used.base_unit,
            TokenBalanceAmount::Some(num) => num,
        };

        msg!("Repaying {}", base_unit_amount);
        self.update_usage((base_unit_amount as i64) * -1, TokenType::Debt);
        self.client.repay(amount, &self.std_accounts)?;
        Ok(())
    }

    fn update_usage(&mut self, base_unit_amount: i64, token_type: TokenType) {
        let position_data = self.position_data();
        if !position_data.self_managed.val || position_data.rebalance.active() {
            self.position_data_mut().update_usage(token_type, base_unit_amount);
        }
    }

    pub fn protocol_interaction(&mut self, action: SolautoAction) -> ProgramResult {
        match action {
            SolautoAction::Deposit(base_unit_amount) => {
                self.deposit(base_unit_amount)?;
            }
            SolautoAction::Borrow(base_unit_amount) => {
                self.borrow(base_unit_amount, self.accounts.debt.position_ta.as_ref().unwrap())?;
            }
            SolautoAction::Repay(amount) => {
                self.repay(amount)?;
            }
            SolautoAction::Withdraw(amount) => {
                self.withdraw(amount, self.accounts.supply.position_ta.as_ref().unwrap())?;
            }
        }
        Ok(())
    }

    fn process_dca(&mut self, amount_to_dca_in: Option<u64>) -> ProgramResult {
        if let Some(amount) = amount_to_dca_in {
            let position_data = self.position_data();
            let dca_token_type = position_data.position.dca.token_type;

            if dca_token_type == TokenType::Supply {
                self.deposit(amount)?;
            } else {
                solana_utils::spl_token_transfer(
                    self.std_accounts.token_program,
                    SplTokenTransferArgs {
                        source: self.accounts.debt.position_ta.as_ref().unwrap(),
                        authority: self.std_accounts.solauto_position.account_info,
                        recipient: self.accounts.intermediary_ta.unwrap(),
                        amount,
                        authority_seeds: Some(&self.get_seeds_with_bump()),
                    }
                )?;
            }
        }
        Ok(())
    }

    fn get_rebalance_amount(
        &self,
        rebalance_args: &RebalanceSettings,
        base_unit_amount: u64,
        increasing_leverage: bool
    ) -> u64 {
        if let Some(target_amount) = rebalance_args.target_amount_base_unit {
            target_amount
        } else if !increasing_leverage {
            min(self.position_data().state.supply.amount_used.base_unit, base_unit_amount)
        } else {
            base_unit_amount
        }
    }

    pub fn begin_rebalance(&mut self, rebalance_args: &RebalanceSettings) -> ProgramResult {
        // Get all immutable data before any mutable borrows
        let fees = self.solauto_fees_bps.as_ref().unwrap();
        let timestamp = Clock::get()?.unix_timestamp as u64;
        let rebalance_type = self.rebalance_data().rebalance_type;
        let flash_loan_amount = self.rebalance_data().flash_loan_amount;

        let (debt_adjustment_usd, amount_to_dca_in) = rebalance_utils::get_rebalance_values(
            self.position_data_mut(),
            rebalance_args,
            fees,
            0, // TODO borrow fee here
            timestamp
        )?;

        self.process_dca(amount_to_dca_in)?;

        let position_data = self.position_data();
        if rebalance_type == SolautoRebalanceType::DoubleRebalanceWithFL {
            validate_debt_adjustment(
                position_data,
                flash_loan_amount,
                debt_adjustment_usd,
                Some(&rebalance_type)
            )?;
            return Ok(());
        }

        let boosting = self.rebalance_data().rebalance_direction == RebalanceDirection::Boost;
        let token = if boosting {
            Box::new(&position_data.state.debt)
        } else {
            Box::new(&position_data.state.supply)
        };

        let base_unit_amount = math_utils::to_base_unit::<f64, u8, u64>(
            debt_adjustment_usd.abs().div(token.market_price()),
            token.decimals
        );

        let final_amount = self.get_rebalance_amount(rebalance_args, base_unit_amount, boosting);

        if boosting {
            self.borrow(final_amount, self.accounts.intermediary_ta.unwrap())
        } else {
            self.withdraw(
                TokenBalanceAmount::Some(final_amount),
                self.accounts.intermediary_ta.unwrap()
            )
        }
    }

    // Helper method to transfer tokens to authority account
    fn transfer_to_authority(
        &self,
        token_accounts: &LendingProtocolTokenAccounts<'a>,
        amount: u64
    ) -> ProgramResult {
        solana_utils::spl_token_transfer(self.std_accounts.token_program, SplTokenTransferArgs {
            source: token_accounts.position_ta.clone().unwrap(),
            authority: self.std_accounts.solauto_position.account_info,
            recipient: token_accounts.authority_ta.clone().unwrap(),
            amount,
            authority_seeds: Some(&self.get_seeds_with_bump()),
        })
    }

    pub fn finish_rebalance(&mut self, rebalance_args: &RebalanceSettings) -> ProgramResult {
        // Get all immutable data before any mutable borrows
        let rebalance_type = self.rebalance_data().rebalance_type;
        let flash_loan_amount = self.rebalance_data().flash_loan_amount;
        let fees = self.solauto_fees_bps.as_ref().unwrap();
        let timestamp = Clock::get()?.unix_timestamp as u64;
        let position_data = self.position_data();

        // Validate debt adjustment for flash loan rebalance types
        if
            rebalance_type == SolautoRebalanceType::FLSwapThenRebalance ||
            rebalance_type == SolautoRebalanceType::FLRebalanceThenSwap
        {
            let (debt_adjustment_usd, _) = rebalance_utils::get_rebalance_values(
                self.position_data_mut(),
                rebalance_args,
                fees,
                0, // TODO flash loan fee
                timestamp
            )?;
            validate_debt_adjustment(
                position_data,
                flash_loan_amount,
                debt_adjustment_usd,
                Some(&rebalance_type)
            )?;
        }

        let boosting = self.rebalance_data().rebalance_direction == RebalanceDirection::Boost;

        // Get available balance
        let mut available_balance = if boosting {
            solauto_utils
                ::safe_unpack_token_account(self.accounts.supply.position_ta)?
                .unwrap().data.amount
        } else {
            solauto_utils
                ::safe_unpack_token_account(self.accounts.debt.position_ta)?
                .unwrap().data.amount
        };

        // Adjust available balance for DCA if needed
        if !position_data.self_managed.val {
            let position = &position_data.position;
            let dca_in_base_unit = position.dca.dca_in_base_unit;
            let dca_token_type = position.dca.token_type;

            if
                (boosting && dca_token_type == TokenType::Supply) ||
                (!boosting && dca_token_type == TokenType::Debt)
            {
                available_balance -= dca_in_base_unit;
            }
        }

        let amount_after_fees = self.payout_fees(available_balance)?;

        // Process rebalance action based on direction
        if boosting {
            if position_data.self_managed.val {
                self.transfer_to_authority(&self.accounts.supply, amount_after_fees)?;
            }
            self.deposit(amount_after_fees)?;
        } else if available_balance > 0 {
            if position_data.self_managed.val {
                self.transfer_to_authority(&self.accounts.debt, amount_after_fees)?;
            }

            let final_amount = if
                rebalance_args.target_liq_utilization_rate_bps.is_some() &&
                rebalance_args.target_liq_utilization_rate_bps.unwrap() == 0
            {
                TokenBalanceAmount::All
            } else {
                TokenBalanceAmount::Some(
                    min(position_data.state.debt.amount_used.base_unit, amount_after_fees)
                )
            };
            self.repay(final_amount)?;
        } else {
            msg!("Missing required position liquidity to rebalance position");
            return Err(SolautoError::IncorrectInstructions.into());
        }

        self.repay_flash_loan(flash_loan_amount, rebalance_type, boosting, rebalance_args)?;

        self.position_data_mut().rebalance = RebalanceData::default();
        Ok(())
    }

    fn repay_flash_loan(
        &mut self,
        flash_loan_amount: u64,
        rebalance_type: SolautoRebalanceType,
        boosting: bool,
        rebalance_args: &RebalanceSettings
    ) -> ProgramResult {
        if flash_loan_amount > 0 {
            // Get all immutable data before any mutable borrows
            let position_data = self.position_data();
            let flash_loan_fee_bps = if boosting {
                position_data.state.debt.flash_loan_fee_bps
            } else {
                position_data.state.supply.flash_loan_fee_bps
            };

            let final_amount = if rebalance_type == SolautoRebalanceType::FLRebalanceThenSwap {
                rebalance_args.target_amount_base_unit.unwrap()
            } else {
                flash_loan_amount.add(
                    (flash_loan_amount as f64).mul(from_bps(flash_loan_fee_bps)) as u64
                )
            };

            if boosting {
                self.borrow(final_amount, self.accounts.intermediary_ta.unwrap())?;
            } else {
                self.withdraw(
                    TokenBalanceAmount::Some(final_amount),
                    self.accounts.intermediary_ta.unwrap()
                )?;
            }
            Ok(())
        } else if
            rebalance_type == SolautoRebalanceType::FLRebalanceThenSwap ||
            rebalance_type == SolautoRebalanceType::FLSwapThenRebalance
        {
            msg!("No flash loan to repay but rebalance type expects flash loan");
            Err(SolautoError::IncorrectInstructions.into())
        } else {
            Ok(())
        }
    }

    fn payout_fees(&self, total_available_balance: u64) -> Result<u64, ProgramError> {
        if self.std_accounts.authority_referral_state.is_none() {
            msg!(
                "Missing referral account when we are boosting leverage. Referral accounts are required"
            );
            return Err(SolautoError::IncorrectAccounts.into());
        }

        let rebalance_direction = self.position_data().rebalance.rebalance_direction;
        let is_boost = rebalance_direction == RebalanceDirection::Boost;

        let token_mint = if is_boost {
            self.position_data().state.supply.mint
        } else {
            self.position_data().state.debt.mint
        };

        let position_ta = if is_boost {
            self.accounts.supply.position_ta.unwrap()
        } else {
            self.accounts.debt.position_ta.unwrap()
        };

        let fee_payout = self.solauto_fees_bps.as_ref().unwrap().fetch_fees(rebalance_direction);

        if fee_payout.total == 0 {
            return Ok(total_available_balance);
        }

        let solauto_fees = (total_available_balance as f64).mul(from_bps(fee_payout.total)) as u64;
        if
            self.std_accounts.solauto_fees_ta.unwrap().key !=
            &get_associated_token_address(&SOLAUTO_FEES_WALLET, &token_mint)
        {
            msg!("Incorrect Solauto fees token account");
            return Err(SolautoError::IncorrectAccounts.into());
        }

        solana_utils::spl_token_transfer(
            self.std_accounts.token_program,
            SplTokenTransferArgs {
                source: position_ta,
                authority: self.std_accounts.solauto_position.account_info,
                recipient: self.std_accounts.solauto_fees_ta.unwrap(),
                amount: solauto_fees,
                authority_seeds: Some(&self.get_seeds_with_bump()),
            }
        )?;

        // Calculate and transfer referrer fees if applicable
        let referrer_fees = (total_available_balance as f64).mul(
            from_bps(fee_payout.referrer)
        ) as u64;
        if referrer_fees > 0 {
            let referred_by_state = &self.std_accounts.authority_referral_state
                .as_ref().unwrap().data.referred_by_state;

            if
                self.std_accounts.referred_by_ta.unwrap().key !=
                &get_associated_token_address(referred_by_state, &token_mint)
            {
                msg!("Incorrect referral fee token account");
                return Err(SolautoError::IncorrectAccounts.into());
            }

            solana_utils::spl_token_transfer(
                self.std_accounts.token_program,
                SplTokenTransferArgs {
                    source: position_ta,
                    authority: self.std_accounts.solauto_position.account_info,
                    recipient: self.std_accounts.referred_by_ta.unwrap(),
                    amount: referrer_fees,
                    authority_seeds: Some(&self.get_seeds_with_bump()),
                }
            )?;
        }

        Ok(total_available_balance - solauto_fees - referrer_fees)
    }

    // Helper method to update token state
    fn update_token_state(
        token_state: &mut crate::state::solauto_position::PositionTokenState,
        token_data: &RefreshedTokenState
    ) {
        token_state.decimals = token_data.decimals;
        token_state.amount_used.base_unit = token_data.amount_used;
        token_state.amount_can_be_used.base_unit = token_data.amount_can_be_used;
        token_state.update_market_price(token_data.market_price);
        token_state.borrow_fee_bps = token_data.borrow_fee_bps.unwrap_or(0);
        token_state.flash_loan_fee_bps = token_data.flash_loan_fee_bps.unwrap_or(0);
    }

    pub fn refresh_position(
        solauto_position: &mut SolautoPosition,
        updated_data: RefreshStateProps,
        clock: Clock
    ) -> ProgramResult {
        // Update mint addresses if self-managed
        if solauto_position.self_managed.val {
            solauto_position.state.supply.mint = updated_data.supply.mint;
            solauto_position.state.debt.mint = updated_data.debt.mint;
        }

        solauto_position.state.max_ltv_bps = to_bps(updated_data.max_ltv);
        solauto_position.state.liq_threshold_bps = to_bps(updated_data.liq_threshold);

        Self::update_token_state(&mut solauto_position.state.supply, &updated_data.supply);
        Self::update_token_state(&mut solauto_position.state.debt, &updated_data.debt);

        solauto_position.state.net_worth.base_unit = math_utils::net_worth_base_amount(
            solauto_position.state.supply.amount_used.usd_value(),
            solauto_position.state.debt.amount_used.usd_value(),
            solauto_position.state.supply.market_price(),
            solauto_position.state.supply.decimals
        );
        solauto_position.state.net_worth.update_usd_value(
            updated_data.supply.market_price,
            solauto_position.state.supply.decimals
        );

        solauto_position.refresh_state();
        solauto_position.state.last_updated = clock.unix_timestamp as u64;

        Ok(())
    }
}
