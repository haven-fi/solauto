use std::str::FromStr;

use marginfi_sdk::generated::accounts::Bank;
use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;

fn main() {
    let rpc_url = String::from("https://api.mainnet-beta.solana.com/");
    let client = RpcClient::new(rpc_url);

    // let pubkey = Pubkey::from_str("2s37akK2eyBbp8DZgCm7RtsaEz8eJP3Nxd4urLHQv7yB").unwrap();
    let pubkey = Pubkey::from_str("CCKtUs6Cgwo4aaQUmBPmyoApH2gUDErxNZCAntD6LYGh").unwrap();
    match client.get_account(&pubkey) {
        Ok(account_info) => {
            let bank = Bank::from_bytes(&account_info.data[8..]).unwrap();
            println!("{:?}", bank);
        }
        Err(e) => println!("An error occurred: {}", e),
    }
}
