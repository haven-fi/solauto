use std::ops::{ Mul, Div };
use solana_program::{ msg, program_error::ProgramError, entrypoint::ProgramResult };
use solend_sdk::{ math::BPS_SCALER, state::Reserve };

use crate::{
    constants::USD_DECIMALS,
    utils::math_utils::{ base_unit_to_usd_value, decimal_to_f64_div_wad, to_base_unit },
};

#[derive(Debug)]
pub struct TokenAmount {
    pub base_unit: u64,
    pub usd_value: f32,
}

#[derive(Debug)]
pub struct PositionTokenUsage {
    pub amount_used: TokenAmount,
    pub amount_can_be_used: TokenAmount,
    pub decimals: u8,
    pub market_price: f64,
    pub flash_loan_fee_bps: u16,
    pub borrow_fee_bps: u16,
}

impl PositionTokenUsage {
    pub fn update_usd_values(&mut self) {
        self.amount_used.usd_value = base_unit_to_usd_value(
            self.amount_used.base_unit,
            self.decimals,
            self.market_price
        );
        self.amount_can_be_used.usd_value = base_unit_to_usd_value(
            self.amount_can_be_used.base_unit,
            self.decimals,
            self.market_price
        );
    }
    pub fn from_solend_data(
        base_unit_amount_used: u64,
        base_unit_amount_can_be_used: u64,
        reserve: &Reserve
    ) -> Self {
        let decimals = reserve.liquidity.mint_decimals;
        let market_price = decimal_to_f64_div_wad(reserve.liquidity.market_price);
        Self {
            amount_used: TokenAmount {
                base_unit: base_unit_amount_used,
                usd_value: base_unit_to_usd_value(base_unit_amount_used, decimals, market_price),
            },
            amount_can_be_used: TokenAmount {
                base_unit: base_unit_amount_can_be_used,
                usd_value: base_unit_to_usd_value(
                    base_unit_amount_can_be_used,
                    decimals,
                    market_price
                ),
            },
            market_price,
            decimals,
            flash_loan_fee_bps: reserve.config.fees.flash_loan_fee_wad.div(BPS_SCALER) as u16,
            borrow_fee_bps: reserve.config.fees.borrow_fee_wad.div(BPS_SCALER) as u16,
        }
    }
}

pub struct LendingProtocolObligationPosition {
    pub max_loan_to_value_ratio: f64,
    pub supply: Option<PositionTokenUsage>,
    pub debt: Option<PositionTokenUsage>,
}

impl LendingProtocolObligationPosition {
    pub fn current_utilization_rate_bps(&self) -> u16 {
        match (&self.debt, &self.supply) {
            (Some(debt), Some(supply)) =>
                debt.amount_used.usd_value
                    .div(supply.amount_used.usd_value.mul(self.max_loan_to_value_ratio as f32))
                    .mul(10000.0) as u16,
            _ => 0,
        }
    }

    pub fn net_worth_usd_base_amount(&self) -> u64 {
        if self.supply.is_none() {
            return 0;
        }

        let supply_usd = self.supply.as_ref().unwrap().amount_used.usd_value;
        let net_worth_usd = if let Some(debt_lquidity) = self.debt.as_ref() {
            supply_usd - debt_lquidity.amount_used.usd_value
        } else {
            supply_usd
        };

        to_base_unit::<f32, u32, u64>(net_worth_usd, USD_DECIMALS)
    }

    pub fn net_worth_base_amount(&self) -> u64 {
        if self.supply.is_none() {
            return 0;
        }

        let supply = self.supply.as_ref().unwrap();
        to_base_unit::<f64, u8, u64>(
            (self.net_worth_usd_base_amount() as f64)
                .div((10u64).pow(USD_DECIMALS) as f64)
                .div(supply.market_price as f64),
            supply.decimals
        )
    }

    pub fn supply_update(&mut self, base_unit_supply_update: i64) -> ProgramResult {
        if let Some(supply) = self.supply.as_mut() {
            if base_unit_supply_update.is_positive() {
                supply.amount_used.base_unit += base_unit_supply_update as u64;
                supply.amount_can_be_used.base_unit -= base_unit_supply_update as u64;
            } else {
                supply.amount_used.base_unit -= (base_unit_supply_update * -1) as u64;
                supply.amount_can_be_used.base_unit += (base_unit_supply_update * -1) as u64;
            }
            supply.update_usd_values();
            Ok(())
        } else {
            msg!("Supply not defined when attempting to modify it");
            return Err(ProgramError::InvalidAccountData.into());
        }
    }

    pub fn debt_update(&mut self, base_unit_debt_amount_update: i64) -> ProgramResult {
        if let Some(debt) = self.debt.as_mut() {
            if base_unit_debt_amount_update.is_positive() {
                debt.amount_used.base_unit += base_unit_debt_amount_update as u64;
                debt.amount_can_be_used.base_unit -= base_unit_debt_amount_update as u64;
            } else {
                debt.amount_used.base_unit -= (base_unit_debt_amount_update * -1) as u64;
                debt.amount_can_be_used.base_unit += (base_unit_debt_amount_update * -1) as u64;
            }
            debt.update_usd_values();
            Ok(())
        } else {
            msg!("Debt not defined when attempting to modify it");
            return Err(ProgramError::InvalidAccountData.into());
        }
    }
}
