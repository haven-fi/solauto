use solana_program::pubkey::Pubkey;

use super::{shared::TokenBalanceAmount, solana::BareSplTokenTransferArgs};

pub struct ToLendingPlatformAction {
    pub amount: TokenBalanceAmount,
}

pub struct FromLendingPlatformAction {
    pub amount: TokenBalanceAmount,
    pub to_wallet_ta: Pubkey,
}

pub enum SolautoCpiAction {
    Deposit(ToLendingPlatformAction),
    Borrow(FromLendingPlatformAction),
    Repay(ToLendingPlatformAction),
    Withdraw(FromLendingPlatformAction),
    SplTokenTransfer(BareSplTokenTransferArgs),
}
