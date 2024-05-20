use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, msg, program::invoke,
    program_error::ProgramError, sysvar::Sysvar,
};
use solend_sdk::{
    instruction::{
        borrow_obligation_liquidity, deposit_reserve_liquidity_and_obligation_collateral,
        init_obligation, refresh_obligation, refresh_reserve,
    },
    state::{LendingMarket, Obligation, Reserve},
};
use std::ops::{Div, Sub};

use crate::{
    constants::SOLEND_PROGRAM,
    types::{
        instruction::{
            accounts::{Context, SolendOpenPositionAccounts},
            SolautoStandardAccounts,
        },
        lending_protocol::*,
        obligation_position::*,
        shared::{
            DeserializedAccount, LendingPlatform, SolautoError, SolautoPosition, TokenBalanceAmount,
        },
    },
    utils::{ix_utils::*, solana_utils::*, solauto_utils::*, validation_utils::*},
};

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
    data: SolendDataAccounts<'a>,
    supply_reserve_oracles: Option<ReserveOracleAccounts<'a>>,
    supply_liquidity: Option<LendingProtocolTokenAccounts<'a>>,
    supply_collateral: Option<LendingProtocolTokenAccounts<'a>>,
    debt_liquidity: Option<LendingProtocolTokenAccounts<'a>>,
    debt_reserve_fee_receiver: Option<&'a AccountInfo<'a>>,
}

impl<'a> SolendClient<'a> {
    pub fn initialize<'b>(
        ctx: &'b Context<'a, SolendOpenPositionAccounts<'a>>,
        solauto_position: &'b DeserializedAccount<'a, SolautoPosition>,
    ) -> ProgramResult {
        if account_has_data(ctx.accounts.obligation) {
            return Ok(());
        }

        let obligation_owner = get_owner(solauto_position, ctx.accounts.signer);
        solauto_invoke_instruction(
            init_obligation(
                SOLEND_PROGRAM,
                *ctx.accounts.obligation.key,
                *ctx.accounts.lending_market.key,
                *obligation_owner.key,
            ),
            &[
                ctx.accounts.obligation.clone(),
                ctx.accounts.lending_market.clone(),
                obligation_owner.clone(),
                ctx.accounts.rent.clone(),
                ctx.accounts.token_program.clone(),
            ],
            &solauto_position,
        )
    }

    pub fn from(
        lending_market: &'a AccountInfo<'a>,
        obligation: &'a AccountInfo<'a>,
        supply_reserve: &'a AccountInfo<'a>,
        supply_reserve_pyth_price_oracle: Option<&'a AccountInfo<'a>>,
        supply_reserve_switchboard_oracle: Option<&'a AccountInfo<'a>>,
        position_supply_liquidity_ta: Option<&'a AccountInfo<'a>>,
        reserve_supply_liquidity_ta: Option<&'a AccountInfo<'a>>,
        supply_collateral_mint: Option<&'a AccountInfo<'a>>,
        position_supply_collateral_ta: Option<&'a AccountInfo<'a>>,
        reserve_supply_collateral_ta: Option<&'a AccountInfo<'a>>,
        debt_reserve: Option<&'a AccountInfo<'a>>,
        debt_reserve_fee_receiver: Option<&'a AccountInfo<'a>>,
        position_debt_liquidity_ta: Option<&'a AccountInfo<'a>>,
        reserve_debt_liquidity_ta: Option<&'a AccountInfo<'a>>,
    ) -> Result<(Self, LendingProtocolObligationPosition), ProgramError> {
        let mut data_accounts = SolendClient::deserialize_solend_accounts(
            lending_market,
            Some(supply_reserve),
            debt_reserve,
            obligation,
        )?;

        let supply_liquidity = LendingProtocolTokenAccounts::from(
            None,
            position_supply_liquidity_ta,
            reserve_supply_liquidity_ta,
        )?;
        let supply_collateral = LendingProtocolTokenAccounts::from(
            supply_collateral_mint,
            position_supply_collateral_ta,
            reserve_supply_collateral_ta,
        )?;
        let debt_liquidity = LendingProtocolTokenAccounts::from(
            None,
            position_debt_liquidity_ta,
            reserve_debt_liquidity_ta,
        )?;

        let supply_reserve_oracles = if supply_reserve_pyth_price_oracle.is_some()
            && supply_reserve_switchboard_oracle.is_some()
        {
            Some(ReserveOracleAccounts {
                pyth_price: supply_reserve_pyth_price_oracle.unwrap(),
                switchboard: supply_reserve_switchboard_oracle.unwrap(),
            })
        } else {
            None
        };

        let obligation_position = SolendClient::get_obligation_position(
            &mut data_accounts.lending_market.data,
            &data_accounts.supply_reserve.as_ref().unwrap().data,
            data_accounts.debt_reserve.as_ref().map(|dr| &dr.data),
            &data_accounts.obligation.data,
        )?;

        let solend_client = Self {
            data: data_accounts,
            supply_reserve_oracles,
            supply_liquidity,
            supply_collateral,
            debt_liquidity,
            debt_reserve_fee_receiver: debt_reserve_fee_receiver,
        };

        Ok((solend_client, obligation_position))
    }

    pub fn deserialize_solend_accounts(
        lending_market: &'a AccountInfo<'a>,
        supply_reserve: Option<&'a AccountInfo<'a>>,
        debt_reserve: Option<&'a AccountInfo<'a>>,
        obligation: &'a AccountInfo<'a>,
    ) -> Result<SolendDataAccounts<'a>, ProgramError> {
        let lending_market =
            DeserializedAccount::<LendingMarket>::unpack(Some(lending_market))?.unwrap();
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
        supply_reserve: &Box<Reserve>,
        debt_reserve: Option<&Box<Reserve>>,
        obligation: &Box<Obligation>,
    ) -> Result<LendingProtocolObligationPosition, ProgramError> {
        let (max_ltv, liq_threshold) = SolendClient::get_max_ltv_and_liq_threshold(supply_reserve);

        let supply_exchange_rate = supply_reserve.collateral_exchange_rate().unwrap();
        let deposited_liquidity = supply_exchange_rate
            .collateral_to_liquidity(supply_reserve.collateral.mint_total_supply)?;

        let base_unit_obligation_deposits = if obligation.deposits.len() > 0 {
            supply_exchange_rate.collateral_to_liquidity(obligation.deposits[0].deposited_amount)?
        } else {
            0
        };

        let base_unit_deposit_room_available =
            supply_reserve.config.deposit_limit.sub(deposited_liquidity);

        let supply = PositionTokenUsage::from_solend_data(
            base_unit_obligation_deposits,
            base_unit_deposit_room_available,
            supply_reserve,
        );

        let debt = if let Some(debt) = debt_reserve {
            let reserve_borrow_limit = debt.liquidity.available_amount;

            let base_unit_obligation_debts = if obligation.borrows.len() > 0 {
                obligation.borrows[0]
                    .borrowed_amount_wads
                    .try_round_u64()
                    .unwrap()
            } else {
                0
            };

            let lending_market_borrow_limit = lending_market
                .rate_limiter
                .remaining_outflow(Clock::get()?.slot)
                .unwrap()
                .try_round_u64()?;
            let base_unit_debt_available = lending_market_borrow_limit.min(reserve_borrow_limit);

            Some(PositionTokenUsage::from_solend_data(
                base_unit_obligation_debts,
                base_unit_debt_available,
                debt,
            ))
        } else {
            None
        };

        Ok(LendingProtocolObligationPosition {
            max_ltv: Some(max_ltv),
            liq_threshold,
            supply,
            debt,
            lending_platform: LendingPlatform::Solend,
        })
    }

    pub fn get_max_ltv_and_liq_threshold(supply_reserve: &Box<Reserve>) -> (f64, f64) {
        (
            (supply_reserve.config.loan_to_value_ratio as f64).div(100 as f64),
            (supply_reserve.config.liquidation_threshold as f64).div(100 as f64),
        )
    }

    pub fn refresh_reserve(
        reserve: &'a AccountInfo<'a>,
        pyth_price_oracle: &'a AccountInfo<'a>,
        switchboard_oracle: &'a AccountInfo<'a>,
    ) -> ProgramResult {
        invoke(
            &refresh_reserve(
                SOLEND_PROGRAM.clone(),
                *reserve.key,
                *pyth_price_oracle.key,
                *switchboard_oracle.key,
            ),
            &[
                reserve.clone(),
                pyth_price_oracle.clone(),
                switchboard_oracle.clone(),
            ],
        )
    }

    pub fn refresh_obligation(
        obligation: &'a AccountInfo<'a>,
        supply_reserve: &'a AccountInfo<'a>,
        debt_reserve: Option<&'a AccountInfo<'a>>,
    ) -> ProgramResult {
        let mut reserve_pubkeys = Vec::new();
        reserve_pubkeys.push(*supply_reserve.key);
        if debt_reserve.is_some() {
            reserve_pubkeys.push(*debt_reserve.unwrap().key);
        }

        let mut account_infos = Vec::new();
        account_infos.push(obligation.clone());
        account_infos.push(supply_reserve.clone());
        if debt_reserve.is_some() {
            account_infos.push(debt_reserve.unwrap().clone());
        }

        invoke(
            &refresh_obligation(SOLEND_PROGRAM.clone(), *obligation.key, reserve_pubkeys),
            &account_infos,
        )
    }
}

impl<'a> LendingProtocolClient<'a> for SolendClient<'a> {
    fn validate(&self, std_accounts: &SolautoStandardAccounts) -> ProgramResult {
        validate_lending_program_accounts_with_position(
            &std_accounts.solauto_position,
            self.data.obligation.account_info,
            self.data
                .supply_reserve
                .as_ref()
                .map_or_else(|| None, |reserve| Some(reserve.account_info)),
            self.data
                .debt_reserve
                .as_ref()
                .map_or_else(|| None, |reserve| Some(reserve.account_info)),
        )?;

        validate_token_accounts(
            std_accounts.signer,
            &std_accounts.solauto_position,
            Some(&self.supply_liquidity.as_ref().unwrap().source_ta),
            self.debt_liquidity
                .as_ref()
                .map_or_else(|| None, |debt| Some(&debt.source_ta)),
        )?;

        let curr_slot = Clock::get()?.slot;
        if self.data.obligation.data.last_update.is_stale(curr_slot)? {
            msg!(
                "Obligation account data is stale. Ensure you refresh everything before interacting"
            );
            return Err(SolautoError::StaleProtocolData.into());
        }

        if self.data.supply_reserve.is_some()
            && self
                .data
                .supply_reserve
                .as_ref()
                .unwrap()
                .data
                .last_update
                .is_stale(curr_slot)?
        {
            msg!(
                "Supply reserve account data is stale. Ensure you refresh everything before interacting"
            );
            return Err(SolautoError::StaleProtocolData.into());
        }

        if self.data.debt_reserve.is_some()
            && self
                .data
                .debt_reserve
                .as_ref()
                .unwrap()
                .data
                .last_update
                .is_stale(curr_slot)?
        {
            msg!(
                "Debt reserve account data is stale. Ensure you refresh everything before interacting"
            );
            return Err(SolautoError::StaleProtocolData.into());
        }

        Ok(())
    }

    fn deposit<'b>(
        &self,
        base_unit_amount: u64,
        std_accounts: &'b SolautoStandardAccounts<'a>,
    ) -> ProgramResult {
        let obligation_owner = get_owner(&std_accounts.solauto_position, std_accounts.signer);
        let supply_liquidity = self.supply_liquidity.as_ref().unwrap();
        let supply_collateral = self.supply_collateral.as_ref().unwrap();
        let supply_reserve = self.data.supply_reserve.as_ref().unwrap().account_info;
        let reserve_oracles = self.supply_reserve_oracles.as_ref().unwrap();

        let deposit_instruction = deposit_reserve_liquidity_and_obligation_collateral(
            SOLEND_PROGRAM.clone(),
            base_unit_amount,
            *supply_liquidity.source_ta.account_info.key,
            *supply_collateral.source_ta.account_info.key,
            *supply_reserve.key,
            *supply_liquidity.protocol_ta.key,
            *supply_collateral.mint.as_ref().unwrap().key,
            *self.data.lending_market.account_info.key,
            *supply_collateral.protocol_ta.key,
            *self.data.obligation.account_info.key,
            *obligation_owner.key,
            *reserve_oracles.pyth_price.key,
            *reserve_oracles.switchboard.key,
            *obligation_owner.key,
        );

        let account_infos = &[
            supply_liquidity.source_ta.account_info.clone(),
            supply_collateral.source_ta.account_info.clone(),
            supply_reserve.clone(),
            supply_liquidity.protocol_ta.clone(),
            supply_collateral.mint.unwrap().clone(),
            self.data.lending_market.account_info.clone(),
            supply_collateral.protocol_ta.clone(),
            self.data.obligation.account_info.clone(),
            obligation_owner.clone(),
            reserve_oracles.pyth_price.clone(),
            reserve_oracles.switchboard.clone(),
            std_accounts.token_program.clone(),
        ];

        solauto_invoke_instruction(
            deposit_instruction,
            account_infos,
            &std_accounts.solauto_position,
        )
    }

    fn withdraw<'b>(
        &self,
        amount: TokenBalanceAmount,
        destination: &'a AccountInfo<'a>,
        std_accounts: &'b SolautoStandardAccounts<'a>,
        obligation_position: &LendingProtocolObligationPosition,
    ) -> ProgramResult {
        // TODO
        Ok(())
    }

    fn borrow<'b>(
        &self,
        base_unit_amount: u64,
        destination: &'a AccountInfo<'a>,
        std_accounts: &'b SolautoStandardAccounts<'a>,
    ) -> ProgramResult {
        let obligation_owner = get_owner(&std_accounts.solauto_position, std_accounts.signer);
        let debt_liquidity = self.debt_liquidity.as_ref().unwrap();
        let debt_reserve = self.data.debt_reserve.as_ref().unwrap().account_info;

        let borrow_instruction = borrow_obligation_liquidity(
            SOLEND_PROGRAM.clone(),
            base_unit_amount,
            *debt_liquidity.protocol_ta.key,
            *destination.key,
            *debt_reserve.key,
            *self.debt_reserve_fee_receiver.unwrap().key,
            *self.data.obligation.account_info.key,
            *self.data.lending_market.account_info.key,
            *obligation_owner.key,
            Some(*destination.key),
        );

        let account_infos = &[
            debt_liquidity.protocol_ta.clone(),
            destination.clone(),
            debt_reserve.clone(),
            self.debt_reserve_fee_receiver.unwrap().clone(),
            self.data.obligation.account_info.clone(),
            self.data.lending_market.account_info.clone(),
            obligation_owner.clone(),
            destination.clone(),
            std_accounts.token_program.clone(),
        ];

        solauto_invoke_instruction(
            borrow_instruction,
            account_infos,
            &std_accounts.solauto_position,
        )
    }

    fn repay<'b>(
        &self,
        amount: TokenBalanceAmount,
        std_accounts: &'b SolautoStandardAccounts<'a>,
        obligation_position: &LendingProtocolObligationPosition,
    ) -> ProgramResult {
        // TODO
        Ok(())
    }
}
