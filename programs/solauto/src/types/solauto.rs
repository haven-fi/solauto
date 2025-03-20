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
