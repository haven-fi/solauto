use solana_program::{ entrypoint::ProgramResult, msg, program_error::ProgramError, pubkey::Pubkey };
use spl_token::state::Account as TokenAccount;

use crate::{
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
        math_utils::{ from_rounded_usd_value, to_rounded_usd_value, usd_value_to_base_unit },
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

pub struct StandardRebalancer<'a> {
    rebalance_args: &'a RebalanceSettings,
    solauto_position: SolautoPositionData<'a>,
    intermediary_ta: Pubkey,
    authority_supply_ta: Pubkey,
    authority_debt_ta: Pubkey,
    solauto_fees_bps: &'a SolautoFeesBps,
}

impl<'a> StandardRebalancer<'a> {
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

    fn get_pre_swap_action(&self) -> (Option<SolautoCpiAction>, u64) {
        if !self.rebalance_data().token_balance_change.requires_one() {
            return (None, 0);
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

        (action, amount)
    }

    pub fn begin_rebalance(&mut self) -> Result<Vec<SolautoCpiAction>, ProgramError> {
        self.set_rebalance_data()?;

        let mut actions = Vec::<SolautoCpiAction>::new();

        let (pre_swap_action, additional_amount_to_swap) = self.get_pre_swap_action();
        if pre_swap_action.is_some() {
            actions.push(pre_swap_action.unwrap());
        }

        let base_unit_amount =
            self.rebalance_args.swap_amount_base_unit - additional_amount_to_swap;

        if self.rebalance_data().rebalance_direction == RebalanceDirection::Boost {
            actions.push(
                SolautoCpiAction::Borrow(FromLendingPlatformAction {
                    amount: TokenBalanceAmount::Some(base_unit_amount),
                    to_wallet_ta: self.intermediary_ta,
                })
            );
        } else {
            actions.push(
                SolautoCpiAction::Withdraw(FromLendingPlatformAction {
                    amount: TokenBalanceAmount::Some(base_unit_amount),
                    to_wallet_ta: self.intermediary_ta,
                })
            );
        }

        Ok(actions)
    }

    pub fn finish_rebalance(&mut self) -> Result<Vec<SolautoCpiAction>, ProgramError> {
        self.set_rebalance_data()?;

        // TODO: DCA / limit order stuff

        Ok(Vec::new())
    }
}
