use super::shared::TokenBalanceAmount;

#[derive(Clone, Copy, Eq, PartialEq, Hash)]
pub enum SolautoAccount {
    SolautoPosition,
    SolautoPositionSupplyTa,
    SolautoPositionDebtTa,
    AuthoritySupplyTa,
    AuthorityDebtTa,
    IntermediaryTa,
    SolautoFeesTa,
    ReferredByTa
}

#[derive(Clone)]
pub struct FromLendingPlatformAction<T> {
    pub amount: T,
    pub to_wallet_ta: SolautoAccount,
}

#[derive(Clone)]
pub struct SolautoSplTokenTransferArgs {
    pub from_wallet: SolautoAccount,
    pub from_wallet_ta: SolautoAccount,
    pub to_wallet_ta: SolautoAccount,
    pub amount: u64,
}

#[derive(Clone)]
pub enum SolautoCpiAction {
    Deposit(u64),
    Borrow(FromLendingPlatformAction<u64>),
    Repay(TokenBalanceAmount),
    Withdraw(FromLendingPlatformAction<TokenBalanceAmount>),
    SplTokenTransfer(SolautoSplTokenTransferArgs),
}

#[derive(Copy, Clone)]
pub struct PositionValues {
    pub supply_usd: f64,
    pub debt_usd: f64,
}

pub struct RebalanceFeesBps {
    pub solauto: u16,
    pub lp_borrow: u16,
    pub flash_loan: u16,
}

pub struct DebtAdjustment {
    pub debt_adjustment_usd: f64,
    pub end_result: PositionValues,
}
