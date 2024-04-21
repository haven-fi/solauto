use std::{ cmp::min, ops::{ Div, Mul, Sub } };
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
};
use spl_token::state::Account as TokenAccount;

use self::{ math_utils::from_base_unit, solauto_utils::is_dca_instruction };

use super::{
    instruction::{ RebalanceArgs, SolautoAction, SolautoStandardAccounts, WithdrawParams },
    lending_protocol::{ LendingProtocolClient, LendingProtocolTokenAccounts },
    obligation_position::LendingProtocolObligationPosition,
    shared::{
        DCADirection,
        DeserializedAccount,
        PositionAccount,
        SolautoError,
        SolautoRebalanceStep,
    },
};
use crate::utils::*;

pub struct SolautoManagerAccounts<'a> {
    pub supply: Option<LendingProtocolTokenAccounts<'a>>,
    pub debt: Option<LendingProtocolTokenAccounts<'a>>,
    pub intermediary_ta: Option<&'a AccountInfo<'a>>,
}
impl<'a> SolautoManagerAccounts<'a> {
    pub fn from(
        supply_mint: Option<&'a AccountInfo<'a>>,
        position_supply_ta: Option<&'a AccountInfo<'a>>,
        bank_supply_ta: Option<&'a AccountInfo<'a>>,
        debt_mint: Option<&'a AccountInfo<'a>>,
        position_debt_ta: Option<&'a AccountInfo<'a>>,
        bank_debt_ta: Option<&'a AccountInfo<'a>>,
        intermediary_ta: Option<&'a AccountInfo<'a>>
    ) -> Result<Self, ProgramError> {
        let supply = LendingProtocolTokenAccounts::from(
            supply_mint,
            position_supply_ta,
            bank_supply_ta
        )?;
        let debt = LendingProtocolTokenAccounts::from(debt_mint, position_debt_ta, bank_debt_ta)?;
        Ok(Self {
            supply,
            debt,
            intermediary_ta,
        })
    }
}

pub struct SolautoManager<'a, 'b> {
    pub client: &'b dyn LendingProtocolClient<'a>,
    pub obligation_position: &'b mut LendingProtocolObligationPosition,
    pub accounts: SolautoManagerAccounts<'a>,
    pub std_accounts: SolautoStandardAccounts<'a>,
    pub solauto_fees_bps: solauto_utils::SolautoFeesBps,
}

impl<'a, 'b> SolautoManager<'a, 'b> {
    pub fn from(
        client: &'b dyn LendingProtocolClient<'a>,
        obligation_position: &'b mut LendingProtocolObligationPosition,
        accounts: SolautoManagerAccounts<'a>,
        std_accounts: SolautoStandardAccounts<'a>
    ) -> Result<Self, ProgramError> {
        client.validate(&std_accounts)?;
        let solauto_fees_bps = solauto_utils::SolautoFeesBps::from(
            std_accounts.referred_by_supply_ta.is_some()
        );
        Ok(Self {
            client,
            obligation_position,
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
                    self.accounts.debt.as_ref().unwrap().source_ta.account_info
                )?;
            }
            SolautoAction::Repay(base_unit_amount) => {
                self.repay(base_unit_amount)?;
            }
            SolautoAction::Withdraw(params) =>
                match params {
                    WithdrawParams::All => {
                        self.withdraw(
                            self.obligation_position.net_worth_base_amount(),
                            self.accounts.supply.as_ref().unwrap().source_ta.account_info
                        )?;
                    }
                    WithdrawParams::Partial(base_unit_amount) =>
                        self.withdraw(
                            base_unit_amount,
                            self.accounts.supply.as_ref().unwrap().source_ta.account_info
                        )?,
                }
        }

        if !self.std_accounts.solauto_position.data.self_managed {
            let repay_from_bps = self.std_accounts.solauto_position.data.position
                .as_ref()
                .unwrap().setting_params.repay_from_bps;
            if self.obligation_position.current_liq_utilization_rate_bps() > repay_from_bps {
                return Err(SolautoError::ExceededValidUtilizationRate.into());
            }
        } else if self.obligation_position.current_liq_utilization_rate_bps() > 9500 {
            return Err(SolautoError::ExceededValidUtilizationRate.into());
        }

        Ok(())
    }

    fn deposit(&mut self, base_unit_amount: u64) -> ProgramResult {
        self.client.deposit(base_unit_amount, &self.std_accounts)?;
        self.obligation_position.supply_lent_update(base_unit_amount as i64)
    }

    fn borrow(&mut self, base_unit_amount: u64, destination: &'a AccountInfo<'a>) -> ProgramResult {
        self.client.borrow(base_unit_amount, destination, &self.std_accounts)?;
        self.obligation_position.debt_borrowed_update(base_unit_amount as i64)
    }

    fn withdraw(
        &mut self,
        base_unit_amount: u64,
        destination: &'a AccountInfo<'a>
    ) -> ProgramResult {
        self.client.withdraw(base_unit_amount, destination, &self.std_accounts)?;
        self.obligation_position.supply_lent_update((base_unit_amount as i64) * -1)
    }

    fn repay(&mut self, base_unit_amount: u64) -> ProgramResult {
        self.client.repay(base_unit_amount, &self.std_accounts)?;
        self.obligation_position.debt_borrowed_update((base_unit_amount as i64) * -1)
    }

    pub fn rebalance(
        &mut self,
        rebalance_args: RebalanceArgs,
        rebalance_step: SolautoRebalanceStep
    ) -> ProgramResult {
        if
            rebalance_step == SolautoRebalanceStep::StartSolautoRebalanceSandwich ||
            rebalance_step == SolautoRebalanceStep::StartMarginfiFlashLoanSandwich
        {
            self.begin_rebalance(&rebalance_args)
        } else if
            rebalance_step == SolautoRebalanceStep::FinishSolautoRebalanceSandwich ||
            rebalance_step == SolautoRebalanceStep::FinishMarginfiFlashLoanSandwich
        {
            self.finish_rebalance()
        } else {
            // TODO
            msg!("Rebalance currently unsupported for this");
            return Err(SolautoError::InvalidRebalanceCondition.into());
        }
    }

    fn adjust_supply_usd_from_dca_in(&mut self) -> Result<f64, ProgramError> {
        let position = self.std_accounts.solauto_position.data.position.as_mut().unwrap();

        let dca_settings = position.active_dca.as_ref().unwrap();

        let percent = (1.0).div(
            (dca_settings.target_dca_periods as f64).sub(dca_settings.dca_periods_passed as f64)
        );

        let debt_ta = &self.accounts.debt.as_ref().unwrap().source_ta;
        let debt = self.obligation_position.debt.as_ref().unwrap();
        let amount = (debt_ta.data.amount as f64).mul(percent) as u64;

        solana_utils::spl_token_transfer(
            self.std_accounts.token_program,
            debt_ta.account_info,
            self.std_accounts.solauto_position.account_info,
            self.accounts.intermediary_ta.unwrap(),
            amount,
            Some(
                vec![
                    &[self.std_accounts.solauto_position.data.position_id],
                    self.std_accounts.solauto_position.data.authority.as_ref()
                ]
            )
        )?;
        position.debt_balance -= amount;

        if dca_settings.dca_periods_passed == dca_settings.target_dca_periods - 1 {
            position.active_dca = None;
        }

        let supply_adjustment = from_base_unit::<u64, u8, f64>(amount, debt.decimals).mul(
            debt.market_price
        );

        Ok(supply_adjustment)
    }

    fn get_dca_out_target_liq_utilization_rate_bps(&mut self) -> Result<u16, ProgramError> {
        let position = self.std_accounts.solauto_position.data.position.as_mut().unwrap();

        let dca_settings = position.active_dca.as_ref().unwrap();
        let percent = (1.0).div(
            (dca_settings.target_dca_periods as f64).sub(dca_settings.dca_periods_passed as f64)
        );

        let setting_params = &mut position.setting_params;

        let new_boost_from_bps = (setting_params.boost_from_bps as f64).sub(
            (setting_params.boost_from_bps as f64).mul(percent)
        ) as u16;
        let diff = setting_params.boost_from_bps - new_boost_from_bps;
        let new_boost_to_bps = if new_boost_from_bps == 0 {
            0
        } else {
            setting_params.boost_to_bps - diff
        };
        setting_params.boost_from_bps = new_boost_from_bps;
        setting_params.boost_to_bps = new_boost_to_bps;

        if dca_settings.dca_periods_passed == dca_settings.target_dca_periods - 1 {
            position.active_dca = None;
        }

        let current_liq_utilization_rate_bps =
            self.obligation_position.current_liq_utilization_rate_bps();
        let target_liq_utilization_rate_bps = (current_liq_utilization_rate_bps as f64).sub(
            (current_liq_utilization_rate_bps as f64).mul(percent)
        ) as u16;

        Ok(target_liq_utilization_rate_bps)
    }

    pub fn get_std_target_liq_utilization_rate_bps(
        &self,
        rebalance_args: &RebalanceArgs
    ) -> Result<u16, SolautoError> {
        let current_liq_utilization_rate_bps =
            self.obligation_position.current_liq_utilization_rate_bps();

        let result: Result<u16, SolautoError> = if
            rebalance_args.target_liq_utilization_rate_bps.is_none()
        {
            let setting_params = &self.std_accounts.solauto_position.data.position
                .as_ref()
                .unwrap().setting_params;
            if current_liq_utilization_rate_bps > setting_params.repay_from_bps {
                let maximum_repay_to_bps = math_utils::get_maximum_repay_to_bps_param(
                    self.obligation_position.max_ltv,
                    self.obligation_position.liq_threshold
                );
                Ok(min(setting_params.repay_to_bps, maximum_repay_to_bps))
            } else if current_liq_utilization_rate_bps < setting_params.boost_from_bps {
                Ok(setting_params.boost_from_bps)
            } else {
                return Err(SolautoError::InvalidRebalanceCondition.into());
            }
        } else {
            Ok(rebalance_args.target_liq_utilization_rate_bps.unwrap())
        };

        let target_rate_bps = result.unwrap();
        Ok(target_rate_bps)
    }

    fn get_debt_adjustment_usd(
        &mut self,
        rebalance_args: &RebalanceArgs
    ) -> Result<f64, ProgramError> {
        let mut total_supply_usd = self.obligation_position.supply
            .as_ref()
            .unwrap().amount_used.usd_value;

        let target_liq_utilization_rate_bps = match
            is_dca_instruction(&self.std_accounts.solauto_position, &self.obligation_position)?
        {
            Some(direction) => {
                match direction {
                    DCADirection::In(_) => {
                        let supply_usd_adjustment = self.adjust_supply_usd_from_dca_in()?;
                        total_supply_usd += supply_usd_adjustment;
                        self.get_std_target_liq_utilization_rate_bps(&rebalance_args)?
                    }
                    DCADirection::Out => self.get_dca_out_target_liq_utilization_rate_bps()?,
                }
            }
            None => self.get_std_target_liq_utilization_rate_bps(&rebalance_args)?,
        };

        let max_price_slippage_bps = if rebalance_args.max_price_slippage_bps.is_some() {
            rebalance_args.max_price_slippage_bps.unwrap()
        } else {
            300
        };

        let increasing_leverage =
            self.obligation_position.current_liq_utilization_rate_bps() <
            target_liq_utilization_rate_bps;

        let adjustment_fee_bps = if increasing_leverage {
            Some(self.solauto_fees_bps.total)
        } else {
            None
        };

        let mut debt_adjustment_usd = math_utils::calculate_debt_adjustment_usd(
            self.obligation_position.liq_threshold,
            total_supply_usd,
            self.obligation_position.debt.as_ref().unwrap().amount_used.usd_value,
            target_liq_utilization_rate_bps,
            adjustment_fee_bps
        );
        debt_adjustment_usd += debt_adjustment_usd.mul(
            (max_price_slippage_bps as f64).div(10000.0)
        );

        Ok(debt_adjustment_usd)
    }

    fn begin_rebalance(&mut self, rebalance_args: &RebalanceArgs) -> ProgramResult {
        let debt_adjustment_usd = self.get_debt_adjustment_usd(rebalance_args)?;
        let increasing_leverage = debt_adjustment_usd > 0.0;

        let (token_mint, market_price, decimals) = if increasing_leverage {
            (
                self.accounts.debt.as_ref().unwrap().mint,
                self.obligation_position.debt.as_ref().unwrap().market_price,
                self.obligation_position.debt.as_ref().unwrap().decimals,
            )
        } else {
            (
                self.accounts.supply.as_ref().unwrap().mint,
                self.obligation_position.supply.as_ref().unwrap().market_price,
                self.obligation_position.supply.as_ref().unwrap().decimals,
            )
        };
        solana_utils::init_ata_if_needed(
            self.std_accounts.token_program,
            self.std_accounts.system_program,
            self.std_accounts.rent,
            self.std_accounts.signer,
            self.std_accounts.signer,
            self.accounts.intermediary_ta.unwrap(),
            token_mint
        )?;

        let base_unit_amount = math_utils::to_base_unit::<f64, u8, u64>(
            debt_adjustment_usd.div(market_price),
            decimals
        );

        if increasing_leverage {
            self.borrow(
                min(
                    base_unit_amount,
                    ((
                        self.obligation_position.debt
                            .as_ref()
                            .unwrap().amount_can_be_used.base_unit as f64
                    ) * 0.9) as u64
                ),
                self.accounts.intermediary_ta.unwrap()
            )
        } else {
            self.withdraw(
                min(
                    base_unit_amount,
                    ((
                        self.obligation_position.supply
                            .as_ref()
                            .unwrap().amount_can_be_used.base_unit as f64
                    ) * 0.9) as u64
                ),
                self.accounts.intermediary_ta.unwrap()
            )
        }
    }

    fn finish_rebalance(&mut self) -> ProgramResult {
        let position_supply_ta = &self.accounts.supply.as_ref().unwrap().source_ta.data;
        let position_debt_ta = &self.accounts.debt.as_ref().unwrap().source_ta.data;

        let available_supply_balance = if self.std_accounts.solauto_position.data.self_managed {
            position_supply_ta.amount
        } else {
            position_supply_ta.amount -
                self.std_accounts.solauto_position.data.position.as_ref().unwrap().supply_balance
        };

        let available_debt_balance = if self.std_accounts.solauto_position.data.self_managed {
            position_debt_ta.amount
        } else {
            position_debt_ta.amount -
                self.std_accounts.solauto_position.data.position.as_ref().unwrap().debt_balance
        };

        if position_supply_ta.amount > 0 {
            let amount_after_fees = self.payout_fees(available_supply_balance)?;
            self.deposit(amount_after_fees)?;
        } else if position_debt_ta.amount > 0 {
            self.repay(available_debt_balance)?;
        } else {
            msg!("Missing required position liquidity to rebalance position");
            return Err(SolautoError::UnableToReposition.into());
        }

        Ok(())
    }

    fn payout_fees(&self, total_available_balance: u64) -> Result<u64, ProgramError> {
        if
            self.std_accounts.authority_referral_state.is_none() ||
            self.std_accounts.referred_by_supply_ta.is_none()
        {
            msg!(
                "Missing referral account(s) when we are boosting leverage. Referral accounts are required"
            );
            return Err(ProgramError::InvalidAccountData.into());
        }

        let position_supply_ta = &self.accounts.supply.as_ref().unwrap().source_ta;

        let solauto_fees = (total_available_balance as f64).mul(
            (self.solauto_fees_bps.solauto as f64).div(10000.0)
        ) as u64;

        solana_utils::spl_token_transfer(
            self.std_accounts.token_program,
            position_supply_ta.account_info,
            self.std_accounts.solauto_position.account_info,
            self.std_accounts.solauto_fees_supply_ta.unwrap(),
            solauto_fees,
            Some(
                vec![
                    &[self.std_accounts.solauto_position.data.position_id],
                    self.std_accounts.solauto_position.data.authority.as_ref()
                ]
            )
        )?;

        let referrer_fees = (total_available_balance as f64).mul(
            (self.solauto_fees_bps.referrer as f64).div(10000.0)
        ) as u64;

        if referrer_fees > 0 {
            solana_utils::spl_token_transfer(
                self.std_accounts.token_program,
                position_supply_ta.account_info,
                self.std_accounts.solauto_position.account_info,
                self.std_accounts.referred_by_supply_ta.unwrap(),
                referrer_fees,
                Some(
                    vec![
                        &[self.std_accounts.solauto_position.data.position_id],
                        self.std_accounts.solauto_position.data.authority.as_ref()
                    ]
                )
            )?;
        }

        Ok(total_available_balance - solauto_fees)
    }

    pub fn refresh_position(
        obligation_position: &LendingProtocolObligationPosition,
        solauto_position: &mut DeserializedAccount<PositionAccount>,
        position_supply_ta: Option<&'a AccountInfo<'a>>,
        position_debt_ta: Option<&'a AccountInfo<'a>>
    ) -> ProgramResult {
        if solauto_position.data.self_managed {
            return Ok(());
        }

        let position = solauto_position.data.position.as_mut().unwrap();

        position.state.net_worth_usd_base_amount = obligation_position.net_worth_usd_base_amount();
        position.state.base_amount_liquidity_net_worth =
            obligation_position.net_worth_base_amount();
        position.state.liq_utilization_rate_bps =
            obligation_position.current_liq_utilization_rate_bps();
        position.state.base_amount_supplied = if obligation_position.supply.is_some() {
            obligation_position.supply.as_ref().unwrap().amount_used.base_unit
        } else {
            0
        };
        position.state.base_amount_supplied = if obligation_position.debt.is_some() {
            obligation_position.debt.as_ref().unwrap().amount_used.base_unit
        } else {
            0
        };

        position.state.max_ltv_bps = obligation_position.max_ltv.mul(10000.0) as u64;
        position.state.liq_threshold = obligation_position.liq_threshold.mul(10000.0) as u64;

        if position_supply_ta.is_some() {
            let account = DeserializedAccount::<TokenAccount>::unpack(position_supply_ta)?.unwrap();
            position.supply_balance = account.data.amount;
        }
        if position_debt_ta.is_some() {
            let account: DeserializedAccount<'_, TokenAccount> = DeserializedAccount::<TokenAccount>
                ::unpack(position_debt_ta)?
                .unwrap();
            position.debt_balance = account.data.amount;
        }

        Ok(())
    }
}
