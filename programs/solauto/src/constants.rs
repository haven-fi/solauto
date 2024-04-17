use solana_program::pubkey::Pubkey;

// So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo
pub const SOLEND_PROGRAM: Pubkey = Pubkey::new_from_array([
    6, 155, 139, 152, 90, 171, 83, 42, 69, 9, 13, 232, 85, 127, 205, 220, 190, 108, 183, 239, 199,
    58, 10, 101, 176, 111, 146, 3, 93, 183, 62, 236,
]);

// MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA
pub const MARGINFI_PROGRAM: Pubkey = Pubkey::new_from_array([
    5, 48, 122, 214, 69, 75, 188, 94, 30, 78, 146, 5, 146, 83, 161, 139, 184, 200, 134, 140, 88,
    166, 49, 46, 200, 106, 57, 230, 34, 78, 55, 59,
]);

// KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD
pub const KAMINO_PROGRAM: Pubkey = Pubkey::new_from_array([
    4, 178, 172, 177, 18, 88, 204, 227, 104, 44, 65, 139, 168, 114, 255, 61, 249, 17, 2, 113, 47,
    21, 175, 18, 182, 190, 105, 179, 67, 91, 0, 8,
]);

// JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4
pub const JUP_PROGRAM: Pubkey = Pubkey::new_from_array([
    4, 121, 213, 91, 242, 49, 192, 110, 238, 116, 197, 110, 206, 104, 21, 7, 253, 177, 178, 222,
    163, 244, 142, 81, 2, 177, 205, 162, 86, 188, 19, 143,
]);

// AprYCPiVeKMCgjQ2ZufwChMzvQ5kFjJo2ekTLSkXsQDm (TODO)
pub const SOLAUTO_ADMIN: Pubkey = Pubkey::new_from_array([
    145, 251, 126, 53, 245, 169, 146, 209, 147, 243, 95, 78, 165, 119, 126, 212, 48, 177, 204, 152,
    35, 228, 216, 122, 54, 147, 76, 46, 180, 66, 110, 112,
]);

// AprYCPiVeKMCgjQ2ZufwChMzvQ5kFjJo2ekTLSkXsQDm (TODO)
pub const SOLAUTO_REBALANCER: Pubkey = Pubkey::new_from_array([
    145, 251, 126, 53, 245, 169, 146, 209, 147, 243, 95, 78, 165, 119, 126, 212, 48, 177, 204, 152,
    35, 228, 216, 122, 54, 147, 76, 46, 180, 66, 110, 112,
]);

// The Solauto fees receiver pubkey (NOT A TOKEN ACCOUNT)
// AprYCPiVeKMCgjQ2ZufwChMzvQ5kFjJo2ekTLSkXsQDm (TODO)
pub const SOLAUTO_FEES_RECEIVER_WALLET: Pubkey = Pubkey::new_from_array([
    145, 251, 126, 53, 245, 169, 146, 209, 147, 243, 95, 78, 165, 119, 126, 212, 48, 177, 204, 152,
    35, 228, 216, 122, 54, 147, 76, 46, 180, 66, 110, 112,
]);

// So11111111111111111111111111111111111111112
pub const WSOL_MINT: Pubkey = Pubkey::new_from_array([
    6, 155, 136, 87, 254, 171, 129, 132, 251, 104, 127, 99, 70, 24, 192, 53, 218, 196, 57, 220, 26,
    235, 59, 85, 152, 160, 240, 0, 0, 0, 0, 1,
]);

pub const USD_DECIMALS: u32 = 6;

pub const REFERRER_FEE_SPLIT: f64 = 0.15; // 15%