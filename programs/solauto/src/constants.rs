use solana_program::pubkey::Pubkey;

// So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo
pub const SOLEND_PROGRAM: Pubkey = Pubkey::new_from_array([
    6, 155, 139, 152, 90, 171, 83, 42, 69, 9, 13, 232, 85, 127, 205, 220, 190, 108, 183, 239, 199, 58,
    10, 101, 176, 111, 146, 3, 93, 183, 62, 236,
]);

// MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA
pub const MARGINFI_PROGRAM: Pubkey = Pubkey::new_from_array([
    5, 48, 122, 214, 69, 75, 188, 94, 30, 78, 146, 5, 146, 83, 161, 139, 184, 200, 134, 140, 88, 166,
    49, 46, 200, 106, 57, 230, 34, 78, 55, 59,
]);

// KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD
pub const KAMINO_PROGRAM: Pubkey = Pubkey::new_from_array([
    4, 178, 172, 177, 18, 88, 204, 227, 104, 44, 65, 139, 168, 114, 255, 61, 249, 17, 2, 113, 47, 21,
    175, 18, 182, 190, 105, 179, 67, 91, 0, 8,
]);

// TODO
// AprYCPiVeKMCgjQ2ZufwChMzvQ5kFjJo2ekTLSkXsQDm
pub const SOLAUTO_ADMIN: Pubkey = Pubkey::new_from_array([
    145, 251, 126, 53, 245, 169, 146, 209, 147, 243, 95, 78, 165, 119, 126, 212, 48, 177, 204, 152,
    35, 228, 216, 122, 54, 147, 76, 46, 180, 66, 110, 112,
]);

pub const SOLAUTO_ADMIN_SETTINGS_ACCOUNT_SEEDS: &[u8] = b"settings";

pub const USD_DECIMALS: u32 = 6;

pub const SOLAUTO_BOOST_FEE_BPS: u16 = 85; // 0.85%
