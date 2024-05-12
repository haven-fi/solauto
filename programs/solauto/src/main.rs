// use std::str::FromStr;

// use borsh::BorshDeserialize;
// use marginfi_sdk::generated::accounts::{Bank, MarginfiAccount};
// use solana_client::rpc_client::RpcClient;
// use solana_sdk::pubkey::Pubkey;
// use fixed::types::I80F48;

// fn main() {
//     let rpc_url = String::from("https://api.mainnet-beta.solana.com/");
//     let client = RpcClient::new(rpc_url);

//     // let pubkey = Pubkey::from_str("CCKtUs6Cgwo4aaQUmBPmyoApH2gUDErxNZCAntD6LYGh").unwrap(); // SOL
//     // let pubkey = Pubkey::from_str("2s37akK2eyBbp8DZgCm7RtsaEz8eJP3Nxd4urLHQv7yB").unwrap(); // USDC
//     let pubkey = Pubkey::from_str("Guu5uBc8k1WK1U2ihGosNaCy57LSgCkpWAabtzQqrQf8").unwrap(); // JUP
//     match client.get_account(&pubkey) {
//         Ok(account_info) => {
//             let bank = Bank::deserialize(&mut account_info.data.as_slice()).unwrap();
//             println!("{:?}", bank);
//             println!("total asset shares {}", I80F48::from_le_bytes(bank.total_asset_shares.value));
//             println!("asset share value {}", I80F48::from_le_bytes(bank.asset_share_value.value));
//             println!("collected insurance fees outstanding {}", I80F48::from_le_bytes(bank.collected_insurance_fees_outstanding.value));
//             println!("collected group fees outstanding {}", I80F48::from_le_bytes(bank.collected_group_fees_outstanding.value));
//             println!("emissions remaining {}", I80F48::from_le_bytes(bank.emissions_remaining.value));
//             println!("asset weight init {}", I80F48::from_le_bytes(bank.config.asset_weight_init.value));
//             println!("asset weight maint {}", I80F48::from_le_bytes(bank.config.asset_weight_maint.value));
//             println!("liability weight init {}", I80F48::from_le_bytes(bank.config.liability_weight_init.value));
//             println!("liability weight maint {}", I80F48::from_le_bytes(bank.config.liability_weight_maint.value));
//         }
//         Err(e) => println!("An error occurred: {}", e),
//     }

//     let pubkey = Pubkey::from_str("3BExFoAiVG7k7QtNvZU1zh7zkSQf2K6P8QwYmRnXFe8F").unwrap();
//     match client.get_account(&pubkey) {
//         Ok(account_info) => {
//             let marginfi_account = MarginfiAccount::deserialize(&mut account_info.data.as_slice()).unwrap();
//             println!("{:?}", marginfi_account);
//             println!("account asset shares {}", I80F48::from_le_bytes(marginfi_account.lending_account.balances[0].asset_shares.value));
//         }
//         Err(e) => println!("An error occurred: {}", e),
//     }

// }

// use std::str::FromStr;

// use solana_client::nonblocking::rpc_client::RpcClient;
// use solana_sdk::{program_pack::Pack, pubkey::Pubkey};
// use solauto::{constants::WSOL_MINT, types::shared::DeserializedAccount};
// use spl_associated_token_account::get_associated_token_address;
// use spl_token::state::Account as TokenAccount;

// #[tokio::main]
// async fn main() {
//     let token_account = get_associated_token_address(
//         &Pubkey::from_str("AprYCPiVeKMCgjQ2ZufwChMzvQ5kFjJo2ekTLSkXsQDm").unwrap(),
//         &WSOL_MINT
//     );
//     // let token_account = get_associated_token_address(
//     //     &Pubkey::from_str("3VEky8Q6BrNf2XnsL4B8ErsVcoQJHR6FnA198HFFTBbS").unwrap(),
//     //     &WSOL_MINT
//     // );
//     // let token_account = Pubkey::from_str("DB4tPRPi3DWuzqTWMXzsZNR8dNdN1AbvnMjdgvMXdkFH").unwrap();

//     let rpc_client = RpcClient::new("https://api.mainnet-beta.solana.com".to_string());

//     let account_data = rpc_client.get_account_data(&token_account).await.unwrap();

//     let data = TokenAccount::unpack(account_data.as_slice()).unwrap();

//     println!("{:?}", data);
// }

use std::{ fs::File, io::Read, str::FromStr };

use solana_client::nonblocking::rpc_client::RpcClient;
use solana_program::pubkey::Pubkey;
use solana_sdk::{
    signature::{ read_keypair_file, Keypair },
    signer::Signer,
    transaction::Transaction,
};
use solauto::{ constants::WSOL_MINT };
use spl_associated_token_account::{
    get_associated_token_address,
    instruction::{create_associated_token_account, create_associated_token_account_idempotent},
};
use spl_token::{ instruction::{ close_account, mint_to, transfer }, ID as token_program_id };

#[tokio::main]
async fn main() {
    let keypair = load_wallet_from_json("/home/mitchell/.config/solana/id.json").unwrap();

    let rpc_client = RpcClient::new("https://api.mainnet-beta.solana.com".to_string());

    let token_account = get_associated_token_address(&keypair.pubkey(), &WSOL_MINT);
    let wallet2 = Pubkey::from_str("5UqsR2PGzbP8pGPbXEeXx86Gjz2N2UFBAuFZUSVydAEe").unwrap();
    let token_account2 = get_associated_token_address(&wallet2, &WSOL_MINT);
    let blockhash = rpc_client.get_latest_blockhash().await.unwrap();

    println!("Token account: {}", token_account);
    println!("signer: {}", keypair.pubkey());

    let lamports = 1_000_000_000;
    let transaction = Transaction::new_signed_with_payer(
        &[
            // close_account(
            //     &token_program_id,
            //     &token_account,
            //     &keypair.pubkey(),
            //     &keypair.pubkey(),
            //     &[]
            // ).unwrap(),
            create_associated_token_account_idempotent(
                &keypair.pubkey(),
                &keypair.pubkey(),
                &WSOL_MINT,
                &token_program_id
            ),
            // solana_sdk::system_instruction::transfer(&keypair.pubkey(), &token_account, lamports),
        ],
        Some(&keypair.pubkey()),
        &[&keypair],
        blockhash
    );

    let result = rpc_client.send_and_confirm_transaction(&transaction).await;
    match result {
        Ok(signature) => println!("Transaction sent successfully with signature: {:?}", signature),
        Err(e) => eprintln!("Error sending transaction: {:?}", e),
    }
}

// Function to load a keypair from a JSON file using the provided solana_sdk function
fn load_wallet_from_json(file_path: &str) -> Result<Keypair, Box<dyn std::error::Error>> {
    let keypair = read_keypair_file(file_path)?;
    Ok(keypair)
}
