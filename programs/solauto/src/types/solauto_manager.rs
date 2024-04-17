use std::ops::{ Div, Mul };
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
};

use crate::utils::{
    math_utils::{ calculate_debt_adjustment_usd, to_base_unit },
    solana_utils::init_ata_if_needed,
    solauto_utils::SolautoFeesBps,
};
use super::{
    instruction::{ SolautoAction, SolautoStandardAccounts, WithdrawParams },
    lending_protocol::{ LendingProtocolClient, LendingProtocolTokenAccounts },
    obligation_position::LendingProtocolObligationPosition,
    shared::{ DeserializedAccount, Position, SolautoError, SolautoRebalanceStep },
};

pub struct SolautoManagerAccounts<'a> {
    pub supply: Option<LendingProtocolTokenAccounts<'a>>,
    pub debt: Option<LendingProtocolTokenAccounts<'a>>,
    pub intermediary_ta: Option<&'a AccountInfo<'a>>,
}
impl<'a> SolautoManagerAccounts<'a> {
    pub fn from(
        supply_mint: Option<&'a AccountInfo<'a>>,
        source_supply_ta: Option<&'a AccountInfo<'a>>,
        bank_supply_ta: Option<&'a AccountInfo<'a>>,
        debt_mint: Option<&'a AccountInfo<'a>>,
        source_debt_ta: Option<&'a AccountInfo<'a>>,
        bank_debt_ta: Option<&'a AccountInfo<'a>>,
        intermediary_ta: Option<&'a AccountInfo<'a>>
    ) -> Self {
        let supply = LendingProtocolTokenAccounts::from(
            supply_mint,
            source_supply_ta,
            bank_supply_ta
        );
        let debt = LendingProtocolTokenAccounts::from(debt_mint, source_debt_ta, bank_debt_ta);
        Self {
            supply,
            debt,
            intermediary_ta,
        }
    }
}

pub struct SolautoManager<'a, 'b> {
    pub client: &'b dyn LendingProtocolClient<'a>,
    pub obligation_position: &'b mut LendingProtocolObligationPosition,
    pub accounts: SolautoManagerAccounts<'a>,
    pub std_accounts: SolautoStandardAccounts<'a>,
    pub solauto_fees_bps: SolautoFeesBps,
}

impl<'a, 'b> SolautoManager<'a, 'b> {
    pub fn from(
        client: &'b dyn LendingProtocolClient<'a>,
        obligation_position: &'b mut LendingProtocolObligationPosition,
        accounts: SolautoManagerAccounts<'a>,
        std_accounts: SolautoStandardAccounts<'a>
    ) -> Result<Self, ProgramError> {
        client.validate(&std_accounts)?;
        let solauto_fees_bps = SolautoFeesBps::from(!&std_accounts.referred_by_ta.is_none());
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
                self.borrow(base_unit_amount, self.accounts.debt.as_ref().unwrap().source_ta)?;
            }
            SolautoAction::Repay(base_unit_amount) => {
                self.repay(base_unit_amount)?;
            }
            SolautoAction::Withdraw(params) =>
                match params {
                    WithdrawParams::All => {
                        self.withdraw(
                            self.obligation_position.net_worth_base_amount(),
                            self.accounts.supply.as_ref().unwrap().source_ta
                        )?;
                    }
                    WithdrawParams::Partial(base_unit_amount) =>
                        self.withdraw(
                            base_unit_amount,
                            self.accounts.supply.as_ref().unwrap().source_ta
                        )?,
                }
        }

        if !self.std_accounts.solauto_position.is_none() {
            let repay_from_bps = self.std_accounts.solauto_position
                .as_ref()
                .unwrap().data.setting_params.repay_from_bps;
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
        target_liq_utilization_rate_bps: u16,
        max_price_slippage_bps: u16,
        rebalance_step: SolautoRebalanceStep
    ) -> ProgramResult {
        if
            rebalance_step == SolautoRebalanceStep::StartSolautoRebalanceSandwich ||
            rebalance_step == SolautoRebalanceStep::StartMarginfiFlashLoanSandwich
        {
            self.begin_rebalance(
                target_liq_utilization_rate_bps,
                max_price_slippage_bps,
                rebalance_step
            )
        } else if
            rebalance_step == SolautoRebalanceStep::FinishSolautoRebalanceSandwich ||
            rebalance_step == SolautoRebalanceStep::FinishMarginfiFlashLoanSandwich
        {
            // TODO also payout solauto fees if increasing leverage
            Ok(())
        } else {
            // TODO
            msg!("Rebalance currently unsupported for this");
            return Err(SolautoError::InvalidRebalanceCondition.into());
        }
    }

    fn begin_rebalance(
        &mut self,
        target_liq_utilization_rate_bps: u16,
        max_price_slippage_bps: u16,
        rebalance_step: SolautoRebalanceStep
    ) -> ProgramResult {
        let increasing_leverage =
            self.obligation_position.current_liq_utilization_rate_bps() <
            target_liq_utilization_rate_bps;

        let mut debt_adjustment_usd = calculate_debt_adjustment_usd(
            self.obligation_position.liq_threshold,
            self.obligation_position.supply.as_ref().unwrap().amount_used.usd_value as f64,
            self.obligation_position.debt.as_ref().unwrap().amount_used.usd_value as f64,
            target_liq_utilization_rate_bps,
            Some(self.solauto_fees_bps.total)
        );
        debt_adjustment_usd += debt_adjustment_usd.mul(
            (max_price_slippage_bps as f64).div(10000.0)
        );

        // TODO flash loan fee currently not supported (SolautoRebalanceStep::FinishStandardFlashLoanSandwich)

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
        init_ata_if_needed(
            self.std_accounts.token_program,
            self.std_accounts.system_program,
            self.std_accounts.rent,
            self.std_accounts.signer,
            self.std_accounts.signer,
            self.accounts.intermediary_ta.unwrap(),
            token_mint
        )?;

        let base_unit_amount = to_base_unit::<f64, u8, u64>(
            debt_adjustment_usd.div(market_price),
            decimals
        );
        if increasing_leverage {
            self.borrow(base_unit_amount, self.accounts.intermediary_ta.unwrap())
        } else {
            self.withdraw(base_unit_amount, self.accounts.intermediary_ta.unwrap())
        }
    }

    fn payout_fees(&self) -> ProgramResult {
        // swap solauto_fee = solauto_fee_value_usd * debt_market_price to the fee_receiver_token
        // send solauto fee to solauto fee receiver address
        Ok(())
    }

    pub fn refresh_position(
        obligation_position: &LendingProtocolObligationPosition,
        solauto_position: &mut Option<DeserializedAccount<Position>>
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
            obligation_position.supply.as_ref().unwrap().amount_used.base_unit
        } else {
            0
        };
        position.data.general_data.base_amount_supplied = if !obligation_position.debt.is_none() {
            obligation_position.debt.as_ref().unwrap().amount_used.base_unit
        } else {
            0
        };
    }
}
