use std::{
    cmp::min,
    ops::{Add, Mul},
};

use solana_program::{entrypoint::ProgramResult, program_error::ProgramError, pubkey::Pubkey};

use crate::{
    check,
    constants::SOLAUTO_FEES_WALLET,
    state::solauto_position::{
        PositionTokenState, RebalanceData, SolautoPosition, TokenBalanceChangeType,
    },
    types::{
        errors::SolautoError,
        instruction::RebalanceSettings,
        shared::{
            BareSplTokenTransferArgs, RebalanceDirection, RebalanceStep, SolautoRebalanceType,
            SwapType, TokenBalanceAmount,
        },
        solauto::{FromLendingPlatformAction, SolautoCpiAction},
    },
    utils::{
        math_utils::{calc_fee_amount, from_bps, from_rounded_usd_value, usd_value_to_base_unit},
        validation_utils::{
            correct_token_account, value_gte_with_threshold, value_lte_with_threshold,
        },
    },
};

use super::{
    solauto_fees::SolautoFeesBps,
    utils::{eligible_for_rebalance, get_rebalance_values},
};

pub struct TokenAccountData {
    pub pk: Pubkey,
    pub balance: u64,
}
impl TokenAccountData {
    pub fn from(pk: Pubkey, balance: u64) -> Self {
        Self { pk, balance }
    }
    pub fn without_balance(pk: Pubkey) -> Self {
        Self { pk, balance: 0 }
    }
}

pub struct SolautoPositionData<'a> {
    pub data: &'a mut Box<SolautoPosition>,
    pub supply_ta: TokenAccountData,
    pub debt_ta: TokenAccountData,
}

pub struct RebalancerData<'a> {
    pub rebalance_args: RebalanceSettings,
    pub solauto_position: SolautoPositionData<'a>,
    pub intermediary_ta: TokenAccountData,
    pub authority_supply_ta: TokenAccountData,
    pub authority_debt_ta: TokenAccountData,
    pub solauto_fees_bps: SolautoFeesBps,
    pub solauto_fees_ta: Pubkey,
    pub referred_by_state: Option<Pubkey>,
    pub referred_by_ta: Option<Pubkey>,
}

pub struct RebalanceResult {
    pub finished: bool,
}

pub struct Rebalancer<'a> {
    actions: Vec<SolautoCpiAction>,
    pub data: RebalancerData<'a>,
}

impl<'a> Rebalancer<'a> {
    pub fn new(data: RebalancerData<'a>) -> Self {
        Self {
            actions: Vec::<SolautoCpiAction>::new(),
            data,
        }
    }

    pub fn actions(&self) -> &Vec<SolautoCpiAction> {
        &self.actions
    }

    pub fn reset_actions(&mut self) {
        self.actions = Vec::new();
    }

    fn position_data(&self) -> &Box<SolautoPosition> {
        &self.data.solauto_position.data
    }

    fn position_supply_ta(&self) -> &TokenAccountData {
        &self.data.solauto_position.supply_ta
    }

    fn position_debt_ta(&self) -> &TokenAccountData {
        &self.data.solauto_position.debt_ta
    }

    fn rebalance_data(&self) -> &RebalanceData {
        &self.position_data().rebalance
    }

    fn is_boost(&self) -> bool {
        self.rebalance_data().values.rebalance_direction == RebalanceDirection::Boost
    }

    fn set_rebalance_data(&mut self) -> ProgramResult {
        if self.rebalance_data().values_set() {
            return Ok(());
        }

        check!(
            eligible_for_rebalance(self.position_data()),
            SolautoError::InvalidRebalanceCondition
        );

        self.data.solauto_position.data.rebalance.values = get_rebalance_values(
            self.position_data(),
            &self.data.rebalance_args,
            &self.data.solauto_fees_bps,
        )?;

        Ok(())
    }

    fn calc_additional_amount(
        &self,
        rounded_usd_value: u64,
        token_usage: PositionTokenState,
        max: Option<u64>,
    ) -> u64 {
        let base_unit_amount = usd_value_to_base_unit(
            from_rounded_usd_value(rounded_usd_value),
            token_usage.decimals,
            token_usage.market_price(),
        );

        if max.is_some() {
            min(base_unit_amount, max.unwrap())
        } else {
            base_unit_amount
        }
    }

    fn get_dynamic_balance(&self) -> (u64, &TokenAccountData) {
        let ta = if self.is_boost() {
            self.position_supply_ta()
        } else {
            self.position_debt_ta()
        };

        let balance = ta.balance;
        // Subtract current balances that are attributed to DCA / limit order in

        (balance, ta)
    }

    fn transfer_to_authority_if_needed(&mut self, base_unit_amount: u64) {
        if self.position_data().self_managed.val {
            let (solauto_position_ta, authority_ta) = if self.is_boost() {
                (self.position_supply_ta().pk, &self.data.authority_supply_ta)
            } else {
                (self.position_debt_ta().pk, &self.data.authority_debt_ta)
            };
            self.actions.push(SolautoCpiAction::SplTokenTransfer(
                BareSplTokenTransferArgs {
                    from_wallet: self.data.solauto_position.data.pubkey(),
                    from_wallet_ta: solauto_position_ta,
                    to_wallet_ta: authority_ta.pk,
                    amount: base_unit_amount,
                },
            ));
        }
    }

    fn pull_liquidity_from_lp(&mut self, base_unit_amount: u64, destination_ta: Pubkey) {
        if self.is_boost() {
            self.actions
                .push(SolautoCpiAction::Borrow(FromLendingPlatformAction {
                    amount: base_unit_amount,
                    to_wallet_ta: destination_ta,
                }));
        } else {
            self.actions
                .push(SolautoCpiAction::Withdraw(FromLendingPlatformAction {
                    amount: TokenBalanceAmount::Some(base_unit_amount),
                    to_wallet_ta: destination_ta,
                }));
        }
    }

    fn put_liquidity_in_lp(&mut self, base_unit_amount: u64) {
        self.transfer_to_authority_if_needed(base_unit_amount);

        if self.is_boost() {
            self.actions
                .push(SolautoCpiAction::Deposit(base_unit_amount));
        } else {
            let token_balance_amount = if self
                .data
                .rebalance_args
                .target_liq_utilization_rate_bps
                .is_some()
                && self
                    .data
                    .rebalance_args
                    .target_liq_utilization_rate_bps
                    .unwrap()
                    == 0
            {
                TokenBalanceAmount::All
            } else {
                TokenBalanceAmount::Some(min(
                    self.position_data().state.debt.amount_used.base_unit,
                    base_unit_amount,
                ))
            };
            self.actions
                .push(SolautoCpiAction::Repay(token_balance_amount));
        }
    }

    fn get_additional_amount_before_swap(&mut self) -> u64 {
        if !self
            .rebalance_data()
            .values
            .token_balance_change
            .requires_one()
        {
            return 0;
        }

        let token_balance_change = self.rebalance_data().values.token_balance_change;
        let mut amount = 0;

        let action = match token_balance_change.change_type {
            TokenBalanceChangeType::PreSwapDeposit => {
                Some(SolautoCpiAction::Deposit(self.calc_additional_amount(
                    token_balance_change.amount_usd,
                    self.position_data().state.supply,
                    Some(self.data.solauto_position.supply_ta.balance),
                )))
            }
            TokenBalanceChangeType::PostSwapDeposit => {
                amount = self.calc_additional_amount(
                    token_balance_change.amount_usd,
                    self.position_data().state.debt,
                    Some(self.data.solauto_position.debt_ta.balance),
                );
                Some(SolautoCpiAction::SplTokenTransfer(
                    BareSplTokenTransferArgs {
                        amount,
                        from_wallet: self.data.solauto_position.data.pubkey(),
                        from_wallet_ta: self.position_debt_ta().pk,
                        to_wallet_ta: self.data.intermediary_ta.pk,
                    },
                ))
            }
            TokenBalanceChangeType::PostRebalanceWithdrawDebtToken => {
                amount = self.calc_additional_amount(
                    token_balance_change.amount_usd,
                    self.position_data().state.supply,
                    Some(self.position_supply_ta().balance),
                );
                Some(SolautoCpiAction::SplTokenTransfer(
                    BareSplTokenTransferArgs {
                        amount,
                        from_wallet: self.data.solauto_position.data.pubkey(),
                        from_wallet_ta: self.position_supply_ta().pk,
                        to_wallet_ta: self.data.intermediary_ta.pk,
                    },
                ))
            }
            _ => None,
        };

        if action.is_some() {
            self.actions.push(action.unwrap());
        }

        amount
    }

    fn get_additional_amount_after_swap(&mut self) -> u64 {
        if !self
            .rebalance_data()
            .values
            .token_balance_change
            .requires_one()
        {
            return 0;
        }

        let token_balance_change = self.rebalance_data().values.token_balance_change;
        let mut amount = 0;

        let action = match token_balance_change.change_type {
            TokenBalanceChangeType::PostRebalanceWithdrawSupplyToken => {
                amount = self.calc_additional_amount(
                    token_balance_change.amount_usd,
                    self.position_data().state.supply,
                    None,
                );
                Some(SolautoCpiAction::SplTokenTransfer(
                    BareSplTokenTransferArgs {
                        amount,
                        from_wallet: self.data.solauto_position.data.pubkey(),
                        from_wallet_ta: self.position_supply_ta().pk,
                        to_wallet_ta: self.data.authority_supply_ta.pk, // TODO: what if this is native mint
                    },
                ))
            }
            TokenBalanceChangeType::PostRebalanceWithdrawDebtToken => {
                amount = self.calc_additional_amount(
                    token_balance_change.amount_usd,
                    self.position_data().state.debt,
                    None,
                );
                Some(SolautoCpiAction::SplTokenTransfer(
                    BareSplTokenTransferArgs {
                        amount,
                        from_wallet: self.data.solauto_position.data.pubkey(),
                        from_wallet_ta: self.position_debt_ta().pk,
                        to_wallet_ta: self.data.authority_debt_ta.pk, // TODO: what if this is native mint
                    },
                ))
            }
            _ => None,
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
        destination_ta: Pubkey,
    ) -> Result<u64, ProgramError> {
        check!(
            correct_token_account(&destination_ta, &destination_wallet, &token_mint),
            SolautoError::IncorrectAccounts
        );

        let fee_amount = calc_fee_amount(available_balance, fee_pct_bps);
        self.actions.push(SolautoCpiAction::SplTokenTransfer(
            BareSplTokenTransferArgs {
                from_wallet: self.data.solauto_position.data.pubkey(),
                from_wallet_ta: position_ta,
                to_wallet_ta: self.data.solauto_fees_ta,
                amount: fee_amount,
            },
        ));

        Ok(fee_amount)
    }

    fn payout_fees(&mut self, available_balance: u64) -> Result<u64, ProgramError> {
        let rebalance_direction = &self.rebalance_data().values.rebalance_direction;
        let (token_mint, position_ta) = if self.is_boost() {
            (
                self.position_data().state.supply.mint,
                self.position_supply_ta().pk,
            )
        } else {
            (
                self.position_data().state.debt.mint,
                self.position_debt_ta().pk,
            )
        };
        let fee_payout = self.data.solauto_fees_bps.fetch_fees(rebalance_direction);
        if fee_payout.total == 0 {
            return Ok(available_balance);
        }

        let solauto_fees = self.payout_fee(
            available_balance,
            fee_payout.solauto,
            token_mint,
            position_ta,
            SOLAUTO_FEES_WALLET,
            self.data.solauto_fees_ta,
        )?;

        let referrer_fees = if self.data.referred_by_state.is_some()
            && self.data.referred_by_state.unwrap() != Pubkey::default()
        {
            self.payout_fee(
                available_balance,
                fee_payout.referrer,
                token_mint,
                position_ta,
                self.data.referred_by_state.unwrap(),
                self.data.referred_by_ta.unwrap(),
            )?
        } else {
            0
        };

        Ok(available_balance - solauto_fees - referrer_fees)
    }

    fn repay_flash_loan_if_necessary(&mut self) -> ProgramResult {
        if matches!(
            self.rebalance_data().ixs.rebalance_type,
            SolautoRebalanceType::DoubleRebalanceWithFL
                | SolautoRebalanceType::FLRebalanceThenSwap
                | SolautoRebalanceType::FLSwapThenRebalance
        ) {
            let flash_loan_amount = self.rebalance_data().ixs.flash_loan_amount;

            let fl_repay_amount = if self.rebalance_data().ixs.swap_type == SwapType::ExactOut {
                self.data.rebalance_args.swap_in_amount_base_unit
            } else {
                check!(flash_loan_amount != 0, SolautoError::IncorrectInstructions);
                let flash_loan_fee_bps = self.data.rebalance_args.flash_loan_fee_bps.unwrap_or(0);
                flash_loan_amount.add(
                    (flash_loan_amount as f64)
                        .mul(from_bps(flash_loan_fee_bps))
                        .ceil() as u64,
                )
            };

            self.pull_liquidity_from_lp(fl_repay_amount, self.data.intermediary_ta.pk);
        }

        Ok(())
    }

    pub fn validate_and_finalize_rebalance(&mut self) -> ProgramResult {
        let curr_supply_usd = self.position_data().state.supply.amount_used.usd_value();
        let curr_debt_usd = self.position_data().state.debt.amount_used.usd_value();

        let target_supply_usd =
            from_rounded_usd_value(self.rebalance_data().values.target_supply_usd);
        let target_debt_usd = from_rounded_usd_value(self.rebalance_data().values.target_debt_usd);

        check!(
            value_gte_with_threshold(curr_supply_usd, target_supply_usd, 0.1),
            SolautoError::InvalidRebalanceMade,
            format!(
                "Supply expected vs. actual: {}, {}",
                target_supply_usd, curr_supply_usd
            )
            .as_str()
        );
        check!(
            value_lte_with_threshold(curr_debt_usd, target_debt_usd, 0.1),
            SolautoError::InvalidRebalanceMade,
            format!(
                "Debt expected vs. actual: {}, {}",
                target_debt_usd, curr_debt_usd
            )
            .as_str()
        );

        self.data.solauto_position.data.rebalance = RebalanceData::default();
        Ok(())
    }

    fn finish_rebalance(&mut self, dynamic_balance: u64) -> ProgramResult {
        let amount_to_put_in_lp = self.payout_fees(dynamic_balance)?;
        self.put_liquidity_in_lp(amount_to_put_in_lp);
        self.repay_flash_loan_if_necessary()?;
        Ok(())
    }

    fn pre_swap_rebalance(&mut self) -> Result<RebalanceResult, ProgramError> {
        self.set_rebalance_data()?;

        let amount_to_swap = self.data.rebalance_args.swap_in_amount_base_unit;
        let additional_amount_to_swap = self.get_additional_amount_before_swap();

        if self.rebalance_data().ixs.swap_type == SwapType::ExactOut {
            let (dynamic_balance, _) = self.get_dynamic_balance();
            println!("dynamic balance {}", dynamic_balance);
            self.finish_rebalance(dynamic_balance)?;
            Ok(RebalanceResult { finished: true })
        } else {
            let amount_to_pull_from_lp = amount_to_swap - additional_amount_to_swap;
            self.pull_liquidity_from_lp(amount_to_pull_from_lp, self.data.intermediary_ta.pk);
            Ok(RebalanceResult { finished: false })
        }
    }

    fn post_swap_rebalance(&mut self) -> Result<RebalanceResult, ProgramError> {
        self.set_rebalance_data()?;

        let additional_amount_after_swap = self.get_additional_amount_after_swap();
        let (dynamic_balance, balance_ta) = self.get_dynamic_balance();
        let balance_leftover = dynamic_balance - additional_amount_after_swap;

        if self.rebalance_data().ixs.swap_type == SwapType::ExactOut {
            self.actions.push(SolautoCpiAction::SplTokenTransfer(
                BareSplTokenTransferArgs {
                    from_wallet: self.data.solauto_position.data.pubkey(),
                    from_wallet_ta: balance_ta.pk,
                    to_wallet_ta: self.data.intermediary_ta.pk,
                    amount: balance_leftover,
                },
            ));
        } else {
            self.finish_rebalance(balance_leftover)?;
        }

        Ok(RebalanceResult { finished: true })
    }

    pub fn rebalance(
        &mut self,
        rebalance_step: RebalanceStep,
    ) -> Result<RebalanceResult, ProgramError> {
        match rebalance_step {
            RebalanceStep::PreSwap => self.pre_swap_rebalance(),
            RebalanceStep::PostSwap => self.post_swap_rebalance(),
        }
    }
}
