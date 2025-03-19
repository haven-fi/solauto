use math_utils::to_bps;
use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, msg,
    program_error::ProgramError,
};

use super::{
    instruction::{RebalanceSettings, SolautoAction, SolautoStandardAccounts},
    lending_protocol::{LendingProtocolClient, LendingProtocolTokenAccounts},
    shared::{RefreshStateProps, RefreshedTokenState, TokenBalanceAmount, TokenType},
};
use crate::{state::solauto_position::SolautoPosition, utils::*};

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
        solauto_fees: Option<solauto_utils::SolautoFeesBps>,
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
        solauto_fees_bps: Option<solauto_utils::SolautoFeesBps>,
    ) -> Result<Self, ProgramError> {
        client.validate(&std_accounts)?;
        Ok(Self {
            client,
            accounts,
            std_accounts,
            solauto_fees_bps,
        })
    }

    fn position_data(&self) -> &Box<SolautoPosition> {
        &self.std_accounts.solauto_position.data
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
            TokenBalanceAmount::All => self.position_data().state.supply.amount_used.base_unit,
            TokenBalanceAmount::Some(num) => num,
        };

        msg!("Withdrawing {}", base_unit_amount);
        self.update_usage((base_unit_amount as i64) * -1, TokenType::Supply);
        self.client
            .withdraw(amount, destination, &self.std_accounts)?;
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
                    self.accounts.debt.position_ta.as_ref().unwrap(),
                )?;
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

    pub fn begin_rebalance(&mut self, rebalance_args: &RebalanceSettings) -> ProgramResult {
        // TODO
        Ok(())
    }

    pub fn finish_rebalance(&mut self, rebalance_args: &RebalanceSettings) -> ProgramResult {
        // TODO
        Ok(())
    }

    fn update_token_state(
        token_state: &mut crate::state::solauto_position::PositionTokenState,
        token_data: &RefreshedTokenState,
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
        clock: Clock,
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
            solauto_position.state.supply.decimals,
        );
        solauto_position.state.net_worth.update_usd_value(
            updated_data.supply.market_price,
            solauto_position.state.supply.decimals,
        );

        solauto_position.refresh_state();
        solauto_position.state.last_updated = clock.unix_timestamp as u64;

        Ok(())
    }
}
