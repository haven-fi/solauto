use std::{ cmp::min, ops::Mul };

use solana_program::{ entrypoint::ProgramResult, msg, program_error::ProgramError, pubkey::Pubkey };
use spl_associated_token_account::get_associated_token_address;
use spl_token::state::Account as TokenAccount;

use crate::{
    constants::SOLAUTO_FEES_WALLET,
    state::solauto_position::{
        PositionTokenState,
        RebalanceData,
        SolautoPosition,
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

    fn get_additional_amount_for_swap(&mut self) -> u64 {
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

        let additional_amount_to_swap = self.get_additional_amount_for_swap();

        let base_unit_amount =
            self.rebalance_args.swap_amount_base_unit - additional_amount_to_swap;

        if self.rebalance_data().rebalance_direction == RebalanceDirection::Boost {
            self.actions.push(
                SolautoCpiAction::Borrow(FromLendingPlatformAction {
                    amount: TokenBalanceAmount::Some(base_unit_amount),
                    to_wallet_ta: self.intermediary_ta,
                })
            );
        } else {
            self.actions.push(
                SolautoCpiAction::Withdraw(FromLendingPlatformAction {
                    amount: TokenBalanceAmount::Some(base_unit_amount),
                    to_wallet_ta: self.intermediary_ta,
                })
            );
        }

        Ok(())
    }

    fn get_post_swap_extra_action(&self) -> (Option<SolautoCpiAction>, u64) {
        // TODO
        (None, 0)
    }

    fn get_balance_after_swap(&self) -> u64 {
        let balance = if self.rebalance_data().rebalance_direction == RebalanceDirection::Boost {
            self.solauto_position.supply_ta.data.amount
        } else {
            self.solauto_position.debt_ta.data.amount
        };

        // TODO: subtract balance waiting for DCA, limit orders, TP, etc.

        balance
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
        let boosting = rebalance_direction == &RebalanceDirection::Boost;
        let token_mint = if boosting {
            self.position_data().state.supply.mint
        } else {
            self.position_data().state.debt.mint
        };
        let position_ta = if boosting {
            self.solauto_position.supply_ta.pk
        } else {
            self.solauto_position.debt_ta.pk
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

    fn transfer_to_authority(&mut self, base_unit_amount: u64) {
        if self.position_data().self_managed.val {
            let (solauto_position_ta, authority_ta) = if
                self.rebalance_data().rebalance_direction == RebalanceDirection::Boost
            {
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

    fn get_token_amount_to_repay(&self, base_unit_amount: u64) -> TokenBalanceAmount {
        if
            self.rebalance_args.target_liq_utilization_rate_bps.is_some() &&
            self.rebalance_args.target_liq_utilization_rate_bps.unwrap() == 0
        {
            TokenBalanceAmount::All
        } else {
            TokenBalanceAmount::Some(
                min(self.position_data().state.debt.amount_used.base_unit, base_unit_amount)
            )
        }
    }

    pub fn finish_rebalance(&mut self) -> ProgramResult {
        self.set_rebalance_data()?;
        let boosting = self.rebalance_data().rebalance_direction == RebalanceDirection::Boost;
        let available_balance = self.get_balance_after_swap();
        let balance_after_fees = self.payout_fees(available_balance)?;

        // TODO: DCA / limit order stuff

        self.transfer_to_authority(balance_after_fees);
        if boosting {
            self.actions.push(
                SolautoCpiAction::Deposit(ToLendingPlatformAction {
                    amount: TokenBalanceAmount::Some(balance_after_fees),
                })
            );
        } else {
            self.actions.push(
                SolautoCpiAction::Repay(ToLendingPlatformAction {
                    amount: self.get_token_amount_to_repay(balance_after_fees),
                })
            );
        }

        // TODO: repay flash loan

        self.solauto_position.data.rebalance = RebalanceData::default();
        Ok(())
    }
}
