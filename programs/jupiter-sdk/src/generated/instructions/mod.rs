//! This code was AUTOGENERATED using the kinobi library.
//! Please DO NOT EDIT THIS FILE, instead use visitors
//! to add features, then rerun kinobi to update it.
//!
//! [https://github.com/metaplex-foundation/kinobi]
//!

pub(crate) mod r#aldrin_swap;
pub(crate) mod r#aldrin_v2_swap;
pub(crate) mod r#balansol_swap;
pub(crate) mod r#claim;
pub(crate) mod r#claim_token;
pub(crate) mod r#clone_swap;
pub(crate) mod r#create_open_orders;
pub(crate) mod r#create_program_open_orders;
pub(crate) mod r#create_token_account;
pub(crate) mod r#create_token_ledger;
pub(crate) mod r#crema_swap;
pub(crate) mod r#cropper_swap;
pub(crate) mod r#cykura_swap;
pub(crate) mod r#deltafi_swap;
pub(crate) mod r#dradex_swap;
pub(crate) mod r#exact_out_route;
pub(crate) mod r#goosefx_swap;
pub(crate) mod r#goosefx_v2_swap;
pub(crate) mod r#helium_treasury_management_redeem_v0;
pub(crate) mod r#invariant_swap;
pub(crate) mod r#lifinity_swap;
pub(crate) mod r#lifinity_v2_swap;
pub(crate) mod r#marco_polo_swap;
pub(crate) mod r#marinade_deposit;
pub(crate) mod r#marinade_unstake;
pub(crate) mod r#mercurial_swap;
pub(crate) mod r#meteora_dlmm_swap;
pub(crate) mod r#meteora_swap;
pub(crate) mod r#moonshot_wrapped_buy;
pub(crate) mod r#moonshot_wrapped_sell;
pub(crate) mod r#obric_swap;
pub(crate) mod r#one_intro_swap;
pub(crate) mod r#open_book_v2_swap;
pub(crate) mod r#perps_add_liquidity;
pub(crate) mod r#perps_remove_liquidity;
pub(crate) mod r#perps_swap;
pub(crate) mod r#perps_v2_add_liquidity;
pub(crate) mod r#perps_v2_remove_liquidity;
pub(crate) mod r#perps_v2_swap;
pub(crate) mod r#phoenix_swap;
pub(crate) mod r#pumpdotfun_wrapped_buy;
pub(crate) mod r#pumpdotfun_wrapped_sell;
pub(crate) mod r#raydium_clmm_swap;
pub(crate) mod r#raydium_clmm_swap_v2;
pub(crate) mod r#raydium_cp_swap;
pub(crate) mod r#raydium_swap;
pub(crate) mod r#route;
pub(crate) mod r#route_with_token_ledger;
pub(crate) mod r#saber_add_decimals;
pub(crate) mod r#saber_swap;
pub(crate) mod r#sencha_swap;
pub(crate) mod r#serum_swap;
pub(crate) mod r#set_token_ledger;
pub(crate) mod r#shared_accounts_exact_out_route;
pub(crate) mod r#shared_accounts_route;
pub(crate) mod r#shared_accounts_route_with_token_ledger;
pub(crate) mod r#stabble_stable_swap;
pub(crate) mod r#stabble_weighted_swap;
pub(crate) mod r#step_swap;
pub(crate) mod r#symmetry_swap;
pub(crate) mod r#token_swap;
pub(crate) mod r#token_swap_v2;
pub(crate) mod r#whirlpool_swap;
pub(crate) mod r#whirlpool_swap_v2;

pub use self::r#aldrin_swap::*;
pub use self::r#aldrin_v2_swap::*;
pub use self::r#balansol_swap::*;
pub use self::r#claim::*;
pub use self::r#claim_token::*;
pub use self::r#clone_swap::*;
pub use self::r#create_open_orders::*;
pub use self::r#create_program_open_orders::*;
pub use self::r#create_token_account::*;
pub use self::r#create_token_ledger::*;
pub use self::r#crema_swap::*;
pub use self::r#cropper_swap::*;
pub use self::r#cykura_swap::*;
pub use self::r#deltafi_swap::*;
pub use self::r#dradex_swap::*;
pub use self::r#exact_out_route::*;
pub use self::r#goosefx_swap::*;
pub use self::r#goosefx_v2_swap::*;
pub use self::r#helium_treasury_management_redeem_v0::*;
pub use self::r#invariant_swap::*;
pub use self::r#lifinity_swap::*;
pub use self::r#lifinity_v2_swap::*;
pub use self::r#marco_polo_swap::*;
pub use self::r#marinade_deposit::*;
pub use self::r#marinade_unstake::*;
pub use self::r#mercurial_swap::*;
pub use self::r#meteora_dlmm_swap::*;
pub use self::r#meteora_swap::*;
pub use self::r#moonshot_wrapped_buy::*;
pub use self::r#moonshot_wrapped_sell::*;
pub use self::r#obric_swap::*;
pub use self::r#one_intro_swap::*;
pub use self::r#open_book_v2_swap::*;
pub use self::r#perps_add_liquidity::*;
pub use self::r#perps_remove_liquidity::*;
pub use self::r#perps_swap::*;
pub use self::r#perps_v2_add_liquidity::*;
pub use self::r#perps_v2_remove_liquidity::*;
pub use self::r#perps_v2_swap::*;
pub use self::r#phoenix_swap::*;
pub use self::r#pumpdotfun_wrapped_buy::*;
pub use self::r#pumpdotfun_wrapped_sell::*;
pub use self::r#raydium_clmm_swap::*;
pub use self::r#raydium_clmm_swap_v2::*;
pub use self::r#raydium_cp_swap::*;
pub use self::r#raydium_swap::*;
pub use self::r#route::*;
pub use self::r#route_with_token_ledger::*;
pub use self::r#saber_add_decimals::*;
pub use self::r#saber_swap::*;
pub use self::r#sencha_swap::*;
pub use self::r#serum_swap::*;
pub use self::r#set_token_ledger::*;
pub use self::r#shared_accounts_exact_out_route::*;
pub use self::r#shared_accounts_route::*;
pub use self::r#shared_accounts_route_with_token_ledger::*;
pub use self::r#stabble_stable_swap::*;
pub use self::r#stabble_weighted_swap::*;
pub use self::r#step_swap::*;
pub use self::r#symmetry_swap::*;
pub use self::r#token_swap::*;
pub use self::r#token_swap_v2::*;
pub use self::r#whirlpool_swap::*;
pub use self::r#whirlpool_swap_v2::*;
