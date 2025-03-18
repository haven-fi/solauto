use solana_program::pubkey::Pubkey;

use super::{ shared::TokenBalanceAmount, solana::BareSplTokenTransferArgs };

pub struct ToLendingPlatformAction {
    amount: TokenBalanceAmount,
}

pub struct FromLendingPlatformAction {
    amount: TokenBalanceAmount,
    to_wallet_ta: Pubkey,
}

pub enum SolautoActionType {
    Deposit(ToLendingPlatformAction),
    Borrow(FromLendingPlatformAction),
    Repay(ToLendingPlatformAction),
    Withdraw(FromLendingPlatformAction),
    SplTokenTransfer(BareSplTokenTransferArgs)
}
