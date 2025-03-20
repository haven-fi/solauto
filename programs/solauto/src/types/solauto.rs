use solana_program::pubkey::Pubkey;

use super::{shared::TokenBalanceAmount, solana::BareSplTokenTransferArgs};

#[derive(Clone)]
pub struct FromLendingPlatformAction {
    pub amount: TokenBalanceAmount,
    pub to_wallet_ta: Pubkey,
}

#[derive(Clone)]
pub enum SolautoCpiAction {
    Deposit(u64),
    Borrow(FromLendingPlatformAction),
    Repay(TokenBalanceAmount),
    Withdraw(FromLendingPlatformAction),
    SplTokenTransfer(BareSplTokenTransferArgs),
}
