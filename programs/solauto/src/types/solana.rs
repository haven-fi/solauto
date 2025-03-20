use solana_program::{account_info::AccountInfo, pubkey::Pubkey};

pub struct SplTokenTransferArgs<'a, 'b> {
    pub source: &'a AccountInfo<'a>,
    pub authority: &'a AccountInfo<'a>,
    pub recipient: &'a AccountInfo<'a>,
    pub amount: u64,
    pub authority_seeds: Option<&'b Vec<&'b [u8]>>,
}

#[derive(Clone)]
pub struct BareSplTokenTransferArgs {
    pub from_wallet: Pubkey,
    pub from_wallet_ta: Pubkey,
    pub to_wallet_ta: Pubkey,
    pub amount: u64,
}
