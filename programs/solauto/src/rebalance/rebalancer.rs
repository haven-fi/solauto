use std::ops::Div;

use solana_program::{ entrypoint::ProgramResult, msg, program_error::ProgramError, pubkey::Pubkey };
use spl_token::state::Account as TokenAccount;

use crate::{
    constants::USD_DECIMALS,
    state::solauto_position::{
        PositionTokenState,
        RebalanceData,
        SolautoPosition,
        TokenBalanceChange,
        TokenBalanceChangeType,
    },
    types::{
        instruction::RebalanceSettings,
        shared::{ SolautoError, TokenBalanceAmount, TokenType },
        solauto::{ SolautoCpiAction, ToLendingPlatformAction },
    },
    utils::{
        math_utils::{
            from_base_unit,
            from_rounded_usd_value,
            to_base_unit,
            to_rounded_usd_value,
            usd_value_to_base_unit,
        },
        solauto_utils::SolautoFeesBps,
    },
};

use super::rebalance_utils_v2::{
    eligible_for_rebalance,
    get_rebalance_values,
    rebalance_from_liquidity_source,
};

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

    fn validate_rebalance_data(&self) -> ProgramResult {
        // TODO: validate debt adjustment usd with calculations
        Ok(())
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

    fn rebalance_data(&self) -> &RebalanceData {
        &self.solauto_position.data.rebalance
    }

    fn get_base_unit_amount(&self, usd_value: f64, token: PositionTokenState) -> u64 {
        usd_value_to_base_unit(usd_value, token.decimals, token.market_price())
    }

    pub fn begin_rebalance(&mut self) -> Result<Vec<SolautoCpiAction>, ProgramError> {
        self.set_rebalance_data()?;

        let mut actions = Vec::<SolautoCpiAction>::new();

        let mut additional_amount_to_swap = 0;

        if self.rebalance_data().token_balance_change.requires_one() {
            let token_balance_change = self.rebalance_data().token_balance_change;
            let supply_source = rebalance_from_liquidity_source(
                &self.rebalance_data().rebalance_direction,
                self.rebalance_args
            );

            let action = match token_balance_change.change_type {
                TokenBalanceChangeType::PreSwapDeposit =>
                    Some(
                        SolautoCpiAction::Deposit(ToLendingPlatformAction {
                            amount: TokenBalanceAmount::Some(
                                self.get_base_unit_amount(
                                    from_rounded_usd_value(token_balance_change.amount_usd),
                                    self.position_data().state.supply
                                )
                            ),
                        })
                    ),
                TokenBalanceChangeType::PostSwapDeposit => {
                    // additional_amount_to_swap =
                    // TODO
                    None
                }
                TokenBalanceChangeType::PostRebalanceWithdrawSupply => None,
                TokenBalanceChangeType::PostRebalanceWithdrawDebt => {
                    // additional_amount_to_swap =
                    // TODO
                    None
                }
                TokenBalanceChangeType::None => None,
            };

            if action.is_some() {
                actions.push(action.unwrap());
            }
        }

        let base_unit_amount =
            self.rebalance_args.swap_amount_base_unit - additional_amount_to_swap;
        // TODO actual borrow / withdraw

        Ok(actions)
    }

    pub fn finish_rebalance(&mut self) -> Result<Vec<SolautoCpiAction>, ProgramError> {
        self.set_rebalance_data()?;

        // TODO: DCA / limit order stuff

        Ok(Vec::new())
    }
}
