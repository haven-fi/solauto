use std::str::FromStr;

use borsh::BorshDeserialize;
use marginfi_sdk::generated::accounts::{Bank, MarginfiAccount};
use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;

fn main() {
    let rpc_url = String::from("https://api.mainnet-beta.solana.com/");
    let client = RpcClient::new(rpc_url);

    let pubkey = Pubkey::from_str("2s37akK2eyBbp8DZgCm7RtsaEz8eJP3Nxd4urLHQv7yB").unwrap();
    // let pubkey = Pubkey::from_str("CCKtUs6Cgwo4aaQUmBPmyoApH2gUDErxNZCAntD6LYGh").unwrap();
    match client.get_account(&pubkey) {
        Ok(account_info) => {
            let bank = Bank::deserialize(&mut account_info.data.as_slice()).unwrap();
            println!("{:?}", bank);
        }
        Err(e) => println!("An error occurred: {}", e),
    }
    
    let pubkey = Pubkey::from_str("3BExFoAiVG7k7QtNvZU1zh7zkSQf2K6P8QwYmRnXFe8F").unwrap();
    match client.get_account(&pubkey) {
        Ok(account_info) => {
            let marginfi_account = MarginfiAccount::deserialize(&mut account_info.data.as_slice()).unwrap();
            println!("{:?}", marginfi_account);
        }
        Err(e) => println!("An error occurred: {}", e),
    }
}

