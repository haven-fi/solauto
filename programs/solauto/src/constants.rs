use solana_program::pubkey::Pubkey;

// KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD
pub const KAMINO_PROGRAM: Pubkey = Pubkey::new_from_array([
    4, 178, 172, 177, 18, 88, 204, 227, 104, 44, 65, 139, 168, 114, 255, 61, 249, 17, 2, 113, 47,
    21, 175, 18, 182, 190, 105, 179, 67, 91, 0, 8,
]);

// AprYCPiVeKMCgjQ2ZufwChMzvQ5kFjJo2ekTLSkXsQDm (TODO)
pub const SOLAUTO_FEES_WALLET: Pubkey = Pubkey::new_from_array([
    145, 251, 126, 53, 245, 169, 146, 209, 147, 243, 95, 78, 165, 119, 126, 212, 48, 177, 204, 152,
    35, 228, 216, 122, 54, 147, 76, 46, 180, 66, 110, 112,
]);

// MNGRcX4nc7quPdzBbNKJ4ScK5EE73JnwJVGxuJXhHCY
pub const SOLAUTO_MANAGER: Pubkey = Pubkey::new_from_array([
    5, 55, 169, 98, 27, 47, 114, 199, 85, 110, 166, 51, 214, 240, 77, 15, 168, 150, 137, 164, 201,
    23, 114, 118, 157, 17, 1, 163, 52, 164, 52, 29,
]);

// So11111111111111111111111111111111111111112
pub const WSOL_MINT: Pubkey = Pubkey::new_from_array([
    6, 155, 136, 87, 254, 171, 129, 132, 251, 104, 127, 99, 70, 24, 192, 53, 218, 196, 57, 220, 26,
    235, 59, 85, 152, 160, 240, 0, 0, 0, 0, 1,
]);

pub const USD_DECIMALS: u8 = 9;

pub const DEFAULT_LIMIT_GAP_BPS: u16 = 1000;
pub const MIN_REPAY_GAP_BPS: u16 = 50;
pub const MIN_BOOST_GAP_BPS: u16 = 50;

pub const MAX_BASIS_POINTS: u16 = 10000;
