use math_utils::to_bps;
use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, msg,
    program_error::ProgramError, pubkey::Pubkey,
};

use super::{
    instruction::{RebalanceSettings, SolautoAction, SolautoStandardAccounts},
    lending_protocol::{LendingProtocolClient, LendingProtocolTokenAccounts},
    shared::{
        RebalanceStep, RefreshStateProps, SplTokenTransferArgs, TokenBalanceAmount, TokenType,
    },
    solauto::SolautoCpiAction,
};
use crate::{
    rebalance::{
        rebalancer::{Rebalancer, RebalancerData, SolautoPositionData, TokenAccountData},
        solauto_fees::SolautoFeesBps,
    },
    state::solauto_position::SolautoPosition,
    utils::{
        solana_utils::spl_token_transfer,
        solauto_utils::{safe_unpack_token_account, update_token_state},
        *,
    },
};

pub struct SolautoManagerAccounts<'a> {
    pub supply: LendingProtocolTokenAccounts<'a>,
    pub debt: LendingProtocolTokenAccounts<'a>,
    pub intermediary_ta: Option<&'a AccountInfo<'a>>,
    pub solauto_fees: Option<SolautoFeesBps>,
}
impl<'a> SolautoManagerAccounts<'a> {
    pub fn from(
        supply: LendingProtocolTokenAccounts<'a>,
        debt: LendingProtocolTokenAccounts<'a>,
        intermediary_ta: Option<&'a AccountInfo<'a>>,
        solauto_fees: Option<SolautoFeesBps>,
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
    pub solauto_fees_bps: Option<SolautoFeesBps>,
}

impl<'a> SolautoManager<'a> {
    pub fn from(
        client: Box<dyn LendingProtocolClient<'a> + 'a>,
        accounts: SolautoManagerAccounts<'a>,
        std_accounts: Box<SolautoStandardAccounts<'a>>,
        solauto_fees_bps: Option<SolautoFeesBps>,
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

    fn get_token_account_data(&self, account: Option<&'a AccountInfo<'a>>) -> TokenAccountData {
        TokenAccountData::from(
            *account.unwrap().key,
            safe_unpack_token_account(account)
                .unwrap()
                .unwrap()
                .data
                .amount,
        )
    }

    fn pk_to_account_info(&self, pk: Pubkey) -> &'a AccountInfo<'a> {
        let accounts = [
            Some(self.std_accounts.solauto_position.account_info),
            self.accounts.supply.position_ta,
            self.accounts.supply.authority_ta,
            self.accounts.debt.position_ta,
            self.accounts.debt.authority_ta,
            self.accounts.intermediary_ta,
            self.std_accounts.solauto_fees_ta,
            self.std_accounts.referred_by_ta,
        ];

        accounts
            .iter()
            .find(|acc| acc.is_some() && acc.unwrap().key == &pk)
            .unwrap()
            .unwrap()
    }

    fn get_rebalancer(&mut self, rebalance_args: RebalanceSettings) -> Rebalancer {
        let position_supply_ta = self.get_token_account_data(self.accounts.supply.position_ta);
        let position_debt_ta = self.get_token_account_data(self.accounts.debt.position_ta);

        Rebalancer::new(RebalancerData {
            rebalance_args,
            solauto_position: SolautoPositionData {
                data: &mut self.std_accounts.solauto_position.data,
                supply_ta: position_supply_ta,
                debt_ta: position_debt_ta,
            },
            authority_supply_ta: TokenAccountData::without_balance(
                *self.accounts.supply.authority_ta.unwrap().key,
            ),
            authority_debt_ta: TokenAccountData::without_balance(
                *self.accounts.debt.authority_ta.unwrap().key,
            ),
            intermediary_ta: TokenAccountData::without_balance(
                *self.accounts.intermediary_ta.unwrap().key,
            ),
            solauto_fees_bps: self.solauto_fees_bps.unwrap().clone(),
            solauto_fees_ta: *self.std_accounts.solauto_fees_ta.unwrap().key,
            referred_by_state: self
                .std_accounts
                .authority_referral_state
                .as_ref()
                .map_or(None, |acc| Some(acc.data.referred_by_state.clone())),
            referred_by_ta: self
                .std_accounts
                .referred_by_ta
                .map_or(None, |acc| Some(*acc.key)),
        })
    }

    fn execute_cpi_actions(&mut self, actions: Vec<SolautoCpiAction>) -> ProgramResult {
        let sm = self;

        for action in actions {
            match action {
                SolautoCpiAction::Deposit(amount) => sm.deposit(amount)?,
                SolautoCpiAction::Withdraw(data) => {
                    sm.withdraw(data.amount, sm.pk_to_account_info(data.to_wallet_ta))?
                }
                SolautoCpiAction::Borrow(data) => {
                    sm.borrow(data.amount, sm.pk_to_account_info(data.to_wallet_ta))?
                }
                SolautoCpiAction::Repay(amount) => sm.repay(amount)?,
                SolautoCpiAction::SplTokenTransfer(data) => {
                    let seeds =
                        if &data.from_wallet == sm.std_accounts.solauto_position.account_info.key {
                            Some(sm.std_accounts.solauto_position.data.seeds_with_bump())
                        } else {
                            None
                        };
                    spl_token_transfer(
                        sm.std_accounts.token_program,
                        SplTokenTransferArgs {
                            amount: data.amount,
                            source: sm.pk_to_account_info(data.from_wallet_ta),
                            authority: sm.pk_to_account_info(data.from_wallet),
                            recipient: sm.pk_to_account_info(data.to_wallet_ta),
                            authority_seeds: seeds.as_ref(),
                        },
                    )?;
                }
            }
        }
        Ok(())
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

        update_token_state(&mut solauto_position.state.supply, &updated_data.supply);
        update_token_state(&mut solauto_position.state.debt, &updated_data.debt);

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
        solauto_position.state.last_refreshed = clock.unix_timestamp as u64;

        Ok(())
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

    pub fn rebalance(
        &mut self,
        rebalance_args: RebalanceSettings,
        rebalance_step: RebalanceStep,
    ) -> ProgramResult {
        let (actions, finished) = {
            let mut rebalancer = self.get_rebalancer(rebalance_args.clone());
            let rebalance_result = rebalancer.rebalance(rebalance_step)?;
            let actions = rebalancer.actions().clone();
            (actions, rebalance_result.finished)
        };

        self.execute_cpi_actions(actions)?;

        if finished {
            let mut rebalancer = self.get_rebalancer(rebalance_args);
            rebalancer.validate_and_finalize_rebalance()?;
        }

        Ok(())
    }
}
