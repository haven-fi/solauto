use std::{ cmp::min, ops::{ Add, Mul } };

use solana_program::{ entrypoint::ProgramResult, msg, program_error::ProgramError, pubkey::Pubkey };
use spl_associated_token_account::get_associated_token_address;
use spl_token::state::Account as TokenAccount;

use crate::{
    constants::SOLAUTO_FEES_WALLET,
    state::solauto_position::{
        PositionTokenState,
        RebalanceData,
        SolautoPosition,
        SolautoRebalanceType,
        TokenBalanceChange,
        TokenBalanceChangeType,
    },
    types::{
        instruction::RebalanceSettings,
        shared::{ RebalanceDirection, SolautoError, TokenBalanceAmount },
        solana::BareSplTokenTransferArgs,
        solauto::{ FromLendingPlatformAction, SolautoCpiAction, ToLendingPlatformAction },
    },
    utils::{
        math_utils::{ from_bps, to_rounded_usd_value, usd_value_to_base_unit },
        solauto_utils::SolautoFeesBps,
    },
};

use super::rebalance_utils_v2::{ eligible_for_rebalance, get_rebalance_values };

pub struct TokenAccountData<'a> {
    pk: Pubkey,
    data: &'a Box<TokenAccount>,
}

pub struct SolautoPositionData<'a> {
    pk: Pubkey,
    data: &'a mut Box<SolautoPosition>,
    supply_ta: TokenAccountData<'a>,
    debt_ta: TokenAccountData<'a>,
}

pub struct Rebalancer<'a> {
    pub actions: Vec<SolautoCpiAction>,

    pub rebalance_args: &'a RebalanceSettings,
    pub solauto_position: SolautoPositionData<'a>,
    pub intermediary_ta: Pubkey,
    pub authority_supply_ta: Pubkey,
    pub authority_debt_ta: Pubkey,
    pub solauto_fees_bps: &'a SolautoFeesBps,
    pub solauto_fees_ta: Pubkey,
    pub referred_by_state: Pubkey,
    pub referred_by_ta: Pubkey,
}

impl<'a> Rebalancer<'a> {
    fn position_data(&self) -> &SolautoPosition {
        &self.solauto_position.data
    }

    fn rebalance_data(&self) -> &RebalanceData {
        &self.solauto_position.data.rebalance
    }

    fn is_boost(&self) -> bool {
        self.rebalance_data().rebalance_direction == RebalanceDirection::Boost
    }

    fn set_rebalance_data(&mut self) -> ProgramResult {
        if self.solauto_position.data.rebalance.debt_adjustment_usd != 0 {
            return Ok(());
        }

        if !eligible_for_rebalance(&self.solauto_position.data) {
            msg!("Invalid rebalance condition");
            return Err(SolautoError::InvalidRebalanceCondition.into());
        }

        let rebalance_values = get_rebalance_values(
            &self.solauto_position.data,
            self.rebalance_args,
            self.solauto_fees_bps
        )?;

        self.solauto_position.data.rebalance.debt_adjustment_usd = to_rounded_usd_value(
            rebalance_values.debt_adjustment_usd
        );
        self.solauto_position.data.rebalance.rebalance_direction =
            rebalance_values.rebalance_direction;
        self.solauto_position.data.rebalance.token_balance_change = if
            rebalance_values.token_balance_change.is_some()
        {
            rebalance_values.token_balance_change.unwrap()
        } else {
            TokenBalanceChange::default()
        };

        self.validate_rebalance_data()
    }

    fn validate_rebalance_data(&self) -> ProgramResult {
        // TODO: validate debt adjustment usd with calculations
        Ok(())
    }

    fn get_base_unit_amount(&self, usd_value: f64, token: PositionTokenState) -> u64 {
        usd_value_to_base_unit(usd_value, token.decimals, token.market_price())
    }

    fn transfer_to_authority_if_needed(&mut self, base_unit_amount: u64) {
        if self.position_data().self_managed.val {
            let (solauto_position_ta, authority_ta) = if self.is_boost() {
                (self.solauto_position.supply_ta.pk, self.authority_supply_ta)
            } else {
                (self.solauto_position.supply_ta.pk, self.authority_debt_ta)
            };
            self.actions.push(
                SolautoCpiAction::SplTokenTransfer(BareSplTokenTransferArgs {
                    from_wallet: self.solauto_position.pk,
                    from_wallet_ta: solauto_position_ta,
                    to_wallet_ta: authority_ta,
                    amount: base_unit_amount,
                })
            );
        }
    }

    fn pull_liquidity_from_lp(&mut self, base_unit_amount: u64, destination_ta: Pubkey) {
        if self.is_boost() {
            self.actions.push(
                SolautoCpiAction::Borrow(FromLendingPlatformAction {
                    amount: TokenBalanceAmount::Some(base_unit_amount),
                    to_wallet_ta: destination_ta,
                })
            );
        } else {
            self.actions.push(
                SolautoCpiAction::Withdraw(FromLendingPlatformAction {
                    amount: TokenBalanceAmount::Some(base_unit_amount),
                    to_wallet_ta: destination_ta,
                })
            );
        }
    }

    fn put_liquidity_in_lp(&mut self, base_unit_amount: u64) {
        self.transfer_to_authority_if_needed(base_unit_amount);

        if self.is_boost() {
            self.actions.push(
                SolautoCpiAction::Deposit(ToLendingPlatformAction {
                    amount: TokenBalanceAmount::Some(base_unit_amount),
                })
            );
        } else {
            let token_balance_amount = if
                self.rebalance_args.target_liq_utilization_rate_bps.is_some() &&
                self.rebalance_args.target_liq_utilization_rate_bps.unwrap() == 0
            {
                TokenBalanceAmount::All
            } else {
                TokenBalanceAmount::Some(
                    min(self.position_data().state.debt.amount_used.base_unit, base_unit_amount)
                )
            };
            self.actions.push(
                SolautoCpiAction::Repay(ToLendingPlatformAction {
                    amount: token_balance_amount,
                })
            );
        }
    }

    fn get_additional_amount_before_swap(&mut self) -> u64 {
        if !self.rebalance_data().token_balance_change.requires_one() {
            return 0;
        }

        let token_balance_change = self.rebalance_data().token_balance_change;
        let mut amount = 0;

        let action = match token_balance_change.change_type {
            TokenBalanceChangeType::None => None,
            TokenBalanceChangeType::PreSwapDeposit =>
                Some(
                    SolautoCpiAction::Deposit(ToLendingPlatformAction {
                        amount: TokenBalanceAmount::Some(amount),
                    })
                ),
            TokenBalanceChangeType::PostSwapDeposit => {
                amount = token_balance_change.base_unit_amount;
                Some(
                    SolautoCpiAction::SplTokenTransfer(BareSplTokenTransferArgs {
                        amount,
                        from_wallet: self.solauto_position.pk,
                        from_wallet_ta: self.solauto_position.debt_ta.pk,
                        to_wallet_ta: self.intermediary_ta,
                    })
                )
            }
            TokenBalanceChangeType::PostRebalanceWithdrawSupply => None,
            TokenBalanceChangeType::PostRebalanceWithdrawDebt => {
                amount = token_balance_change.base_unit_amount;
                Some(
                    SolautoCpiAction::SplTokenTransfer(BareSplTokenTransferArgs {
                        amount,
                        from_wallet: self.solauto_position.pk,
                        from_wallet_ta: self.solauto_position.supply_ta.pk,
                        to_wallet_ta: self.intermediary_ta,
                    })
                )
            }
        };

        if action.is_some() {
            self.actions.push(action.unwrap());
        }

        amount
    }

    pub fn begin_rebalance(&mut self) -> ProgramResult {
        self.set_rebalance_data()?;

        let amount_to_swap = self.rebalance_args.swap_amount_base_unit;
        let additional_amount_to_swap = self.get_additional_amount_before_swap();
        let base_unit_amount = amount_to_swap - additional_amount_to_swap;

        self.pull_liquidity_from_lp(base_unit_amount, self.intermediary_ta);

        Ok(())
    }

    fn get_additional_amount_after_swap(&mut self) -> u64 {
        if !self.rebalance_data().token_balance_change.requires_one() {
            return 0;
        }

        let token_balance_change = self.rebalance_data().token_balance_change;
        let mut amount = 0;

        let action = match token_balance_change.change_type {
            TokenBalanceChangeType::None => None,
            TokenBalanceChangeType::PreSwapDeposit => None,
            TokenBalanceChangeType::PostSwapDeposit => None,
            TokenBalanceChangeType::PostRebalanceWithdrawSupply => {
                amount = token_balance_change.base_unit_amount;
                Some(
                    SolautoCpiAction::SplTokenTransfer(BareSplTokenTransferArgs {
                        amount,
                        from_wallet: self.solauto_position.pk,
                        from_wallet_ta: self.solauto_position.supply_ta.pk,
                        to_wallet_ta: self.authority_supply_ta, // TODO: what if this is native mint
                    })
                )
            }
            TokenBalanceChangeType::PostRebalanceWithdrawDebt => {
                amount = token_balance_change.base_unit_amount;
                Some(
                    SolautoCpiAction::SplTokenTransfer(BareSplTokenTransferArgs {
                        amount,
                        from_wallet: self.solauto_position.pk,
                        from_wallet_ta: self.solauto_position.debt_ta.pk,
                        to_wallet_ta: self.authority_debt_ta, // TODO: what if this is native mint
                    })
                )
            }
        };

        if action.is_some() {
            self.actions.push(action.unwrap());
        }

        amount
    }

    fn payout_fee(
        &mut self,
        available_balance: u64,
        fee_pct_bps: u16,
        token_mint: Pubkey,
        position_ta: Pubkey,
        destination_wallet: Pubkey,
        destination_ta: Pubkey
    ) -> Result<u64, ProgramError> {
        if destination_ta != get_associated_token_address(&destination_wallet, &token_mint) {
            msg!("Incorrect fee token account provided");
            return Err(SolautoError::IncorrectAccounts.into());
        }

        let fee_amount = (available_balance as f64).mul(from_bps(fee_pct_bps)) as u64;
        self.actions.push(
            SolautoCpiAction::SplTokenTransfer(BareSplTokenTransferArgs {
                from_wallet: self.solauto_position.pk,
                from_wallet_ta: position_ta,
                to_wallet_ta: self.solauto_fees_ta,
                amount: fee_amount,
            })
        );

        Ok(fee_amount)
    }

    fn payout_fees(&mut self, available_balance: u64) -> Result<u64, ProgramError> {
        let rebalance_direction = &self.rebalance_data().rebalance_direction;
        let (token_mint, position_ta) = if self.is_boost() {
            (self.position_data().state.supply.mint, self.solauto_position.supply_ta.pk)
        } else {
            (self.position_data().state.debt.mint, self.solauto_position.debt_ta.pk)
        };
        let fee_payout = self.solauto_fees_bps.fetch_fees(rebalance_direction);
        if fee_payout.total == 0 {
            return Ok(available_balance);
        }

        let solauto_fees = self.payout_fee(
            available_balance,
            fee_payout.solauto,
            token_mint,
            position_ta,
            SOLAUTO_FEES_WALLET,
            self.solauto_fees_ta
        )?;

        let referrer_fees = self.payout_fee(
            available_balance,
            fee_payout.referrer,
            token_mint,
            position_ta,
            self.referred_by_state,
            self.referred_by_ta
        )?;

        Ok(available_balance - solauto_fees - referrer_fees)
    }

    fn repay_flash_loan(&mut self) {
        if
            matches!(
                self.rebalance_data().rebalance_type,
                SolautoRebalanceType::DoubleRebalanceWithFL |
                    SolautoRebalanceType::FLRebalanceThenSwap |
                    SolautoRebalanceType::FLSwapThenRebalance
            )
        {
            let fl_repay_amount = if
                self.rebalance_data().rebalance_type == SolautoRebalanceType::FLRebalanceThenSwap
            {
                self.rebalance_args.swap_amount_base_unit
            } else {
                let flash_loan_amount = self.rebalance_data().flash_loan_amount;
                let flash_loan_fee_bps = if self.is_boost() {
                    self.position_data().state.debt.flash_loan_fee_bps
                } else {
                    self.position_data().state.supply.flash_loan_fee_bps
                };

                flash_loan_amount.add(
                    (flash_loan_amount as f64).mul(from_bps(flash_loan_fee_bps)).ceil() as u64
                )
            };

            self.pull_liquidity_from_lp(fl_repay_amount, self.intermediary_ta);
        }
    }

    fn get_balance_after_swap(&self) -> u64 {
        let balance = if self.is_boost() {
            self.solauto_position.supply_ta.data.amount
        } else {
            self.solauto_position.debt_ta.data.amount
        };

        // Subtract current balances that are attributed to DCA / limit order in

        balance
    }

    pub fn finish_rebalance(&mut self) -> ProgramResult {
        self.set_rebalance_data()?;

        let balance_after_swap = self.get_balance_after_swap();
        let additional_amount_to_swap = self.get_additional_amount_after_swap();
        let base_unit_amount = balance_after_swap - additional_amount_to_swap;

        let balance_after_fees = self.payout_fees(base_unit_amount)?;

        self.put_liquidity_in_lp(balance_after_fees);

        self.repay_flash_loan();

        self.solauto_position.data.rebalance = RebalanceData::default();
        Ok(())
    }
}
