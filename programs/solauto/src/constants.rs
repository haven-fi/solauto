use solana_program::{pubkey, pubkey::Pubkey};

pub const SOLAUTO_FEES_WALLET: Pubkey = pubkey!("AprYCPiVeKMCgjQ2ZufwChMzvQ5kFjJo2ekTLSkXsQDm");
pub const SOLAUTO_MANAGER: Pubkey = pubkey!("MNGRcX4nc7quPdzBbNKJ4ScK5EE73JnwJVGxuJXhHCY");
pub const WSOL_MINT: Pubkey = pubkey!("So11111111111111111111111111111111111111112");

pub const MARGINFI_PROD_PROGRAM: Pubkey = pubkey!("MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA");
pub const MARGINFI_STAGING_PROGRAM: Pubkey = pubkey!("stag8sTKds2h4KzjUw3zKTsxbqvT4XKHdaR9X9E6Rct");

pub const USD_DECIMALS: u8 = 9;

pub const DEFAULT_LIMIT_GAP_BPS: u16 = 1000;
pub const MIN_REPAY_GAP_BPS: u16 = 50;
pub const MIN_BOOST_GAP_BPS: u16 = 50;

pub const MAX_BASIS_POINTS: u16 = 10000;

pub const REFERRER_PERCENTAGE: f64 = 0.15;

pub const OFFSET_FROM_MAX_LTV: f64 = 0.005;
