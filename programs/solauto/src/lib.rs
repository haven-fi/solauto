pub mod clients;
pub mod constants;
pub mod entrypoint;
pub mod instructions;
pub mod processors;
pub mod state;
pub mod types;
pub mod utils;
pub mod rebalance;

use solana_security_txt::security_txt;
security_txt! {
    name: "solauto",
    project_url: "https://havenfi.xyz/",
    contacts: "contacthavenfi@gmail.com",
    policy: "https://github.com/haven-fi/solauto/blob/master/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/haven-fi/solauto"
}

use solana_program::declare_id;

#[cfg(feature = "test")]
declare_id!("TesTjfQ6TbXv96Tv6fqr95XTZ1LYPxtkafmShN9PjBp");

#[cfg(not(feature = "test"))]
declare_id!("AutoyKBRaHSBHy9RsmXCZMy6nNFAg5FYijrvZyQcNLV");
