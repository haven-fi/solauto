use solana_program::pubkey::Pubkey;

use super::shared::{ TokenBalanceAmount, BareSplTokenTransferArgs };

#[derive(Clone)]
pub struct FromLendingPlatformAction<T> {
    pub amount: T,
    pub to_wallet_ta: Pubkey,
}

#[derive(Clone)]
pub enum SolautoCpiAction {
    Deposit(u64),
    Borrow(FromLendingPlatformAction<u64>),
    Repay(TokenBalanceAmount),
    Withdraw(FromLendingPlatformAction<TokenBalanceAmount>),
    SplTokenTransfer(BareSplTokenTransferArgs),
}

#[derive(Copy, Clone)]
pub struct PositionValues {
    pub supply_usd: f64,
    pub debt_usd: f64,
}

pub struct RebalanceFeesBps {
    pub solauto: u16,
    pub lp_borrow: u16,
    pub lp_flash_loan: u16,
}

pub struct DebtAdjustment {
    pub debt_adjustment_usd: f64,
    pub as_flash_loan: bool,
    pub end_result: PositionValues,
}