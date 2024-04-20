use solana_program::{ entrypoint::ProgramResult, msg, program_error::ProgramError };
use solend_sdk::{ math::BPS_SCALER, state::Reserve };
use std::{ ops::{ Div, Mul }, cmp::max };

use crate::{
    constants::USD_DECIMALS,
    utils::math_utils::{
        base_unit_to_usd_value,
        decimal_to_f64_div_wad,
        from_base_unit,
        to_base_unit,
    },
};

use super::shared::LendingPlatform;

#[derive(Debug)]
pub struct TokenAmount {
    pub base_unit: u64,
    pub usd_value: f64,
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
        let mut borrow_fee_bps = reserve.config.fees.borrow_fee_wad.div(BPS_SCALER) as u16;
        let host_fee_pct = (reserve.config.fees.host_fee_percentage as f64) / 100.0;

        // We reallocate the host fee to the user, so we will deduct the borrow_fee_bps by host_fee_pct
        borrow_fee_bps = ((borrow_fee_bps as f64) -
            (borrow_fee_bps as f64).mul(host_fee_pct)) as u16;

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
            borrow_fee_bps,
        }
    }
}

pub struct LendingProtocolObligationPosition {
    pub max_ltv: f64,
    pub liq_threshold: f64,
    pub supply: Option<PositionTokenUsage>,
    pub debt: Option<PositionTokenUsage>,
    pub lending_platform: LendingPlatform,
}

impl LendingProtocolObligationPosition {
    pub fn current_liq_utilization_rate_bps(
        &self,
        update_supply_base_amount: Option<i64>,
        update_debt_base_amount: Option<i64>
    ) -> u16 {
        let mut supply_base_amount = if let Some(supply) = self.supply.as_ref() {
            supply.amount_used.base_unit as i64
        } else {
            0
        };
        if update_supply_base_amount.is_some() {
            supply_base_amount += update_supply_base_amount.unwrap();
        }

        let mut debt_base_amount = if let Some(debt) = self.debt.as_ref() {
            debt.amount_used.base_unit as i64
        } else {
            0
        };
        if update_debt_base_amount.is_some() {
            debt_base_amount = max(0, debt_base_amount + update_debt_base_amount.unwrap());
        }

        if debt_base_amount <= 0 {
            return 0;
        } else {
            let supply_usd_value = (supply_base_amount as f64).mul(
                self.supply.as_ref().unwrap().market_price
            );
            let debt_usd_value = (debt_base_amount as f64).mul(
                self.debt.as_ref().unwrap().market_price
            );
            debt_usd_value.div(supply_usd_value.mul(self.liq_threshold as f64)).mul(10000.0) as u16
        }
    }

    pub fn net_worth_usd_base_amount(&self) -> u64 {
        if self.supply.is_none() {
            return 0;
        }

        let supply_usd = self.supply.as_ref().unwrap().amount_used.usd_value;
        let debt_usd = self.debt.as_ref().unwrap().amount_used.usd_value;

        let net_worth_usd = if self.debt.is_none() || debt_usd == 0.0 {
            supply_usd
        } else {
            supply_usd - debt_usd
        };

        to_base_unit::<f64, u32, u64>(net_worth_usd, USD_DECIMALS)
    }

    pub fn net_worth_base_amount(&self) -> u64 {
        if self.supply.is_none() {
            return 0;
        }

        let supply = self.supply.as_ref().unwrap();

        if self.debt.is_none() || self.debt.as_ref().unwrap().amount_used.base_unit == 0 {
            return supply.amount_used.base_unit;
        }

        let supply_net_worth = from_base_unit::<u64, u32, f64>(
            self.net_worth_usd_base_amount(),
            USD_DECIMALS
        ).div(supply.market_price as f64);
        to_base_unit::<f64, u8, u64>(supply_net_worth, supply.decimals)
    }

    pub fn supply_lent_update(&mut self, base_unit_supply_update: i64) -> ProgramResult {
        if let Some(supply) = self.supply.as_mut() {
            if base_unit_supply_update.is_positive() {
                supply.amount_used.base_unit += base_unit_supply_update as u64;
                supply.amount_can_be_used.base_unit -= base_unit_supply_update as u64;
            } else {
                supply.amount_used.base_unit -= (base_unit_supply_update * -1) as u64;

                if self.lending_platform != LendingPlatform::Solend {
                    supply.amount_can_be_used.base_unit += (base_unit_supply_update * -1) as u64;
                }
            }
            supply.update_usd_values();
            Ok(())
        } else {
            msg!("Supply not defined when attempting to modify it");
            return Err(ProgramError::InvalidAccountData.into());
        }
    }

    pub fn debt_borrowed_update(&mut self, base_unit_debt_amount_update: i64) -> ProgramResult {
        if let Some(debt) = self.debt.as_mut() {
            if base_unit_debt_amount_update.is_positive() {
                let borrow_fee = (base_unit_debt_amount_update as f64).mul(
                    (debt.borrow_fee_bps as f64).div(10000.0)
                );
                debt.amount_used.base_unit +=
                    (base_unit_debt_amount_update as u64) + (borrow_fee as u64);
                debt.amount_can_be_used.base_unit -= base_unit_debt_amount_update as u64;
            } else {
                debt.amount_used.base_unit -= (base_unit_debt_amount_update * -1) as u64;

                if self.lending_platform != LendingPlatform::Solend {
                    debt.amount_can_be_used.base_unit += (base_unit_debt_amount_update * -1) as u64;
                }
            }
            debt.update_usd_values();
            Ok(())
        } else {
            msg!("Debt not defined when attempting to modify it");
            return Err(ProgramError::InvalidAccountData.into());
        }
    }
}
