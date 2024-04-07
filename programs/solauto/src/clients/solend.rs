use std::ops::{ Div, Sub };
use solana_program::{
    account_info::AccountInfo,
    clock::Clock,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    sysvar::Sysvar,
};
use solend_sdk::{
    instruction::{
        init_obligation,
        refresh_reserve,
        refresh_obligation,
        deposit_reserve_liquidity_and_obligation_collateral,
        borrow_obligation_liquidity,
    },
    state::{ LendingMarket, Obligation, Reserve },
};

use crate::{
    constants::SOLEND_PROGRAM,
    types::{
        instruction::accounts::{
            Context,
            SolendOpenPositionAccounts,
            SolendProtocolInteractionAccounts,
        },
        lending_protocol::*,
        obligation_position::*,
        shared::{ DeserializedAccount, LendingPlatform, Position, SolautoError },
    },
    utils::{ ix_utils::*, solauto_utils::* },
};

pub struct SystemAccounts<'a> {
    pub system_program: &'a AccountInfo<'a>,
    pub token_program: &'a AccountInfo<'a>,
    pub ata_program: &'a AccountInfo<'a>,
    pub clock: &'a AccountInfo<'a>,
    pub rent: &'a AccountInfo<'a>,
}

pub struct ReserveOracleAccounts<'a> {
    pub pyth_price: &'a AccountInfo<'a>,
    pub switchboard: &'a AccountInfo<'a>,
}

pub struct SolendDataAccounts<'a> {
    pub lending_market: DeserializedAccount<'a, LendingMarket>,
    pub supply_reserve: Option<DeserializedAccount<'a, Reserve>>,
    pub debt_reserve: Option<DeserializedAccount<'a, Reserve>>,
    pub obligation: DeserializedAccount<'a, Obligation>,
}

pub struct SolendClient<'a> {
    signer: &'a AccountInfo<'a>,
    system_accounts: SystemAccounts<'a>,
    data: SolendDataAccounts<'a>,
    supply_reserve_oracles: Option<ReserveOracleAccounts<'a>>,
    supply_liquidity: Option<LendingProtocolTokenAccounts<'a>>,
    supply_collateral: Option<LendingProtocolTokenAccounts<'a>>,
    debt_liquidity: Option<LendingProtocolTokenAccounts<'a>>,
    debt_reserve_fee_receiver: Option<&'a AccountInfo<'a>>,
    solauto_position: Option<DeserializedAccount<'a, Position>>,
    solauto_fee_receiver: &'a AccountInfo<'a>,
}

impl<'a> SolendClient<'a> {
    pub fn initialize<'b>(
        ctx: &'b Context<'a, SolendOpenPositionAccounts>,
        solauto_position: &Option<DeserializedAccount<Position>>
    ) -> ProgramResult {
        let obligation_owner = get_owner(&ctx.accounts.solauto_position, ctx.accounts.signer);

        invoke_instruction(
            init_obligation(
                SOLEND_PROGRAM,
                *ctx.accounts.obligation.key,
                *ctx.accounts.lending_market.key,
                *obligation_owner.key
            ),
            &[
                ctx.accounts.obligation.clone(),
                ctx.accounts.lending_market.clone(),
                obligation_owner.clone(),
                ctx.accounts.rent.clone(),
                ctx.accounts.token_program.clone(),
            ],
            &solauto_position
        )
    }

    pub fn from<'b>(
        ctx: &'b Context<'a, SolendProtocolInteractionAccounts<'a>>
    ) -> Result<(Self, LendingProtocolObligationPosition), ProgramError> {
        let mut data_accounts = SolendClient::deserialize_solend_accounts(
            ctx.accounts.lending_market,
            ctx.accounts.supply_reserve,
            ctx.accounts.debt_reserve,
            ctx.accounts.obligation
        )?;

        let supply_liquidity = LendingProtocolTokenAccounts::from(
            ctx.accounts.supply_liquidity_token_mint,
            ctx.accounts.source_supply_liquidity,
            ctx.accounts.reserve_supply_liquidity
        );
        let supply_collateral = LendingProtocolTokenAccounts::from(
            ctx.accounts.supply_collateral_token_mint,
            ctx.accounts.source_supply_collateral,
            ctx.accounts.reserve_supply_collateral
        );
        let debt_liquidity = LendingProtocolTokenAccounts::from(
            ctx.accounts.debt_liquidity_token_mint,
            ctx.accounts.source_debt_liquidity,
            ctx.accounts.reserve_debt_liquidity
        );

        let supply_reserve_oracles = if
            !ctx.accounts.supply_reserve_pyth_price_oracle.is_none() &&
            !ctx.accounts.supply_reserve_switchboard_oracle.is_none()
        {
            Some(ReserveOracleAccounts {
                pyth_price: ctx.accounts.supply_reserve_pyth_price_oracle.unwrap(),
                switchboard: ctx.accounts.supply_reserve_switchboard_oracle.unwrap(),
            })
        } else {
            None
        };

        let obligation_position = SolendClient::get_obligation_position(
            &mut data_accounts.lending_market.data,
            data_accounts.supply_reserve.as_ref().map(|sr| &sr.data),
            data_accounts.debt_reserve.as_ref().map(|dr| &dr.data),
            &data_accounts.obligation.data
        )?;

        let solauto_position = DeserializedAccount::<Position>::deserialize(
            ctx.accounts.solauto_position
        )?;

        let solend_client = Self {
            signer: ctx.accounts.signer,
            system_accounts: SystemAccounts {
                system_program: ctx.accounts.system_program,
                token_program: ctx.accounts.token_program,
                ata_program: ctx.accounts.ata_program,
                clock: ctx.accounts.clock,
                rent: ctx.accounts.rent,
            },
            data: data_accounts,
            supply_reserve_oracles,
            supply_liquidity,
            supply_collateral,
            debt_liquidity,
            debt_reserve_fee_receiver: ctx.accounts.debt_reserve_fee_receiver,
            solauto_position,
            solauto_fee_receiver: ctx.accounts.solauto_fee_receiver,
        };

        Ok((solend_client, obligation_position))
    }

    pub fn deserialize_solend_accounts(
        lending_market: &'a AccountInfo<'a>,
        supply_reserve: Option<&'a AccountInfo<'a>>,
        debt_reserve: Option<&'a AccountInfo<'a>>,
        obligation: &'a AccountInfo<'a>
    ) -> Result<SolendDataAccounts<'a>, ProgramError> {
        let lending_market = DeserializedAccount::<LendingMarket>
            ::unpack(Some(lending_market))?
            .unwrap();
        let supply_reserve = DeserializedAccount::<Reserve>::unpack(supply_reserve)?;
        let debt_reserve = DeserializedAccount::<Reserve>::unpack(debt_reserve)?;
        let obligation = DeserializedAccount::<Obligation>::unpack(Some(obligation))?.unwrap();

        Ok(SolendDataAccounts {
            lending_market,
            supply_reserve,
            debt_reserve,
            obligation,
        })
    }

    pub fn get_obligation_position(
        lending_market: &mut LendingMarket,
        supply_reserve: Option<&Box<Reserve>>,
        debt_reserve: Option<&Box<Reserve>>,
        obligation: &Box<Obligation>
    ) -> Result<LendingProtocolObligationPosition, ProgramError> {
        let max_loan_to_value_ratio = if let Some(supply) = supply_reserve {
            (supply.config.loan_to_value_ratio as f64).div(100 as f64)
        } else {
            0.0
        };

        let supply_liquidity = if let Some(supply) = supply_reserve {
            let supply_exchange_rate = supply.collateral_exchange_rate().unwrap();
            let deposited_liquidity = supply_exchange_rate.collateral_to_liquidity(
                supply.collateral.mint_total_supply
            )?;
            let base_unit_max_depositable = supply.config.deposit_limit.sub(deposited_liquidity);
            let base_unit_deposited_amount = if obligation.deposits.len() > 0 {
                supply_exchange_rate.collateral_to_liquidity(
                    obligation.deposits[0].deposited_amount
                )?
            } else {
                0
            };
            Some(
                PositionTokenUsage::from_solend_data(
                    base_unit_deposited_amount,
                    base_unit_max_depositable,
                    supply
                )
            )
        } else {
            None
        };

        let debt_liquidity = if let Some(debt) = debt_reserve {
            let reserve_borrow_limit = debt.liquidity.available_amount;
            let lending_market_borrow_limit = lending_market.rate_limiter
                .remaining_outflow(Clock::get()?.slot)
                .unwrap()
                .try_round_u64()?;
            let base_unit_max_borrowable = lending_market_borrow_limit.min(reserve_borrow_limit);

            let base_amount_used = if obligation.borrows.len() > 0 {
                obligation.borrows[0].borrowed_amount_wads.try_round_u64().unwrap()
            } else {
                0
            };

            Some(
                PositionTokenUsage::from_solend_data(
                    base_amount_used,
                    base_unit_max_borrowable,
                    debt
                )
            )
        } else {
            None
        };

        Ok(LendingProtocolObligationPosition {
            max_loan_to_value_ratio,
            supply: supply_liquidity,
            debt: debt_liquidity,
            lending_platform: LendingPlatform::Solend
        })
    }

    pub fn refresh_reserve(
        reserve: &'a AccountInfo<'a>,
        pyth_price_oracle: &'a AccountInfo<'a>,
        switchboard_oracle: &'a AccountInfo<'a>
    ) -> ProgramResult {
        invoke_instruction(
            refresh_reserve(
                SOLEND_PROGRAM.clone(),
                *reserve.key,
                *pyth_price_oracle.key,
                *switchboard_oracle.key
            ),
            &[reserve.clone(), pyth_price_oracle.clone(), switchboard_oracle.clone()],
            &None
        )
    }

    pub fn refresh_obligation(
        obligation: &'a AccountInfo<'a>,
        supply_reserve: &'a AccountInfo<'a>,
        debt_reserve: Option<&'a AccountInfo<'a>>
    ) -> ProgramResult {
        let mut reserve_pubkeys = Vec::new();
        reserve_pubkeys.push(*supply_reserve.key);
        if !debt_reserve.is_none() {
            reserve_pubkeys.push(*debt_reserve.unwrap().key);
        }

        let mut account_infos = Vec::new();
        account_infos.push(obligation.clone());
        account_infos.push(supply_reserve.clone());
        if !debt_reserve.is_none() {
            account_infos.push(debt_reserve.unwrap().clone());
        }

        invoke_instruction(
            refresh_obligation(SOLEND_PROGRAM.clone(), *obligation.key, reserve_pubkeys),
            &account_infos,
            &None
        )
    }
}

impl<'a> LendingProtocolClient for SolendClient<'a> {
    fn validate(&self) -> ProgramResult {
        let curr_slot = Clock::get()?.slot;
        if self.data.obligation.data.last_update.is_stale(curr_slot)? {
            msg!(
                "Obligation account data is stale. Ensure you refresh everything before interacting"
            );
            return Err(SolautoError::StaleProtocolData.into());
        }
        if
            !self.data.supply_reserve.is_none() &&
            self.data.supply_reserve.as_ref().unwrap().data.last_update.is_stale(curr_slot)?
        {
            msg!(
                "Supply reserve account data is stale. Ensure you refresh everything before interacting"
            );
            return Err(SolautoError::StaleProtocolData.into());
        }
        if
            !self.data.debt_reserve.is_none() &&
            self.data.debt_reserve.as_ref().unwrap().data.last_update.is_stale(curr_slot)?
        {
            msg!(
                "Debt reserve account data is stale. Ensure you refresh everything before interacting"
            );
            return Err(SolautoError::StaleProtocolData.into());
        }
        Ok(())
    }

    fn deposit(&self, base_unit_amount: u64) -> ProgramResult {
        let supply_liquidity = self.supply_liquidity.as_ref().unwrap();
        let supply_collateral = self.supply_collateral.as_ref().unwrap();

        let obligation_owner = if !self.solauto_position.is_none() {
            self.solauto_position.as_ref().unwrap().account_info
        } else {
            self.signer
        };

        let supply_reserve = self.data.supply_reserve.as_ref().unwrap().account_info;
        let reserve_oracles = self.supply_reserve_oracles.as_ref().unwrap();

        let deposit_instruction = deposit_reserve_liquidity_and_obligation_collateral(
            SOLEND_PROGRAM.clone(),
            base_unit_amount,
            *supply_liquidity.source_token_account.key,
            *supply_collateral.source_token_account.key,
            *supply_reserve.key,
            *supply_liquidity.reserve_token_account.key,
            *supply_collateral.token_mint.key,
            *self.data.lending_market.account_info.key,
            *supply_collateral.reserve_token_account.key,
            *self.data.obligation.account_info.key,
            *obligation_owner.key,
            *reserve_oracles.pyth_price.key,
            *reserve_oracles.switchboard.key,
            *obligation_owner.key
        );

        let account_infos = &[
            supply_liquidity.source_token_account.clone(),
            supply_collateral.source_token_account.clone(),
            supply_reserve.clone(),
            supply_liquidity.reserve_token_account.clone(),
            supply_collateral.token_mint.clone(),
            self.data.lending_market.account_info.clone(),
            supply_collateral.reserve_token_account.clone(),
            self.data.obligation.account_info.clone(),
            obligation_owner.clone(),
            reserve_oracles.pyth_price.clone(),
            reserve_oracles.switchboard.clone(),
            self.system_accounts.token_program.clone(),
        ];

        invoke_instruction(deposit_instruction, account_infos, &self.solauto_position)
    }

    fn withdraw(&self, base_unit_amount: u64) -> ProgramResult {
        // TODO
        Ok(())
    }

    fn borrow(&self, base_unit_amount: u64) -> ProgramResult {
        let debt_liquidity = self.debt_liquidity.as_ref().unwrap();

        let obligation_owner = if !self.solauto_position.is_none() {
            self.solauto_position.as_ref().unwrap().account_info
        } else {
            self.signer
        };

        let debt_reserve = self.data.debt_reserve.as_ref().unwrap().account_info;

        let borrow_instruction = borrow_obligation_liquidity(
            SOLEND_PROGRAM.clone(),
            base_unit_amount,
            *debt_liquidity.reserve_token_account.key,
            *debt_liquidity.source_token_account.key,
            *debt_reserve.key,
            *self.debt_reserve_fee_receiver.unwrap().key,
            *self.data.obligation.account_info.key,
            *self.data.lending_market.account_info.key,
            *obligation_owner.key,
            Some(*self.solauto_fee_receiver.key)
        );

        let account_infos = &[
            debt_liquidity.reserve_token_account.clone(),
            debt_liquidity.source_token_account.clone(),
            debt_reserve.clone(),
            self.debt_reserve_fee_receiver.unwrap().clone(),
            self.data.obligation.account_info.clone(),
            self.data.lending_market.account_info.clone(),
            obligation_owner.clone(),
            self.solauto_fee_receiver.clone(),
            self.system_accounts.token_program.clone(),
        ];

        invoke_instruction(borrow_instruction, account_infos, &self.solauto_position)
    }

    fn repay(&self, base_unit_amount: u64) -> ProgramResult {
        // TODO
        Ok(())
    }
}
