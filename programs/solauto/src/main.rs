// use std::{ borrow::Borrow, ops::Div, str::FromStr };

// use borsh::BorshDeserialize;
// use bytemuck::{ Pod, Zeroable };
// use fixed::types::I80F48;
// use marginfi_sdk::generated::accounts::{ Bank, MarginfiAccount };
// use solana_client::rpc_client::RpcClient;
// use solana_sdk::pubkey::Pubkey;
// use solauto::{ types::shared::DeserializedAccount, utils::math_utils::{self, i80f48_to_f64, i80f48_to_u64} };

fn main() {
    // let rpc_url = String::from("https://api.mainnet-beta.solana.com/");
    // let client = RpcClient::new(rpc_url);

    // let pubkey = Pubkey::from_str("CCKtUs6Cgwo4aaQUmBPmyoApH2gUDErxNZCAntD6LYGh").unwrap(); // SOL
    // // let pubkey = Pubkey::from_str("2s37akK2eyBbp8DZgCm7RtsaEz8eJP3Nxd4urLHQv7yB").unwrap(); // USDC
    // // let pubkey = Pubkey::from_str("Guu5uBc8k1WK1U2ihGosNaCy57LSgCkpWAabtzQqrQf8").unwrap(); // JUP
    // match client.get_account(&pubkey) {
    //     Ok(account_info) => {
    //         // let bank = Bank::deserialize(&mut account_info.data.as_slice()).unwrap();
    //         let bank = bytemuck::from_bytes::<Bank>(&account_info.data.borrow());
    //         // let bank = Ref::<_, Bank>::new(account_info.data.borrow()).unwrap();
    //         println!("{:?}", bank);
    //         println!("total asset shares {}", I80F48::from_le_bytes(bank.total_asset_shares.value));
    //         println!("asset share value {}", I80F48::from_le_bytes(bank.asset_share_value.value));
    //         println!(
    //             "asset weight init {}",
    //             I80F48::from_le_bytes(bank.config.asset_weight_init.value)
    //         );
    //         println!(
    //             "asset weight maint {}",
    //             I80F48::from_le_bytes(bank.config.asset_weight_maint.value)
    //         );
    //         println!(
    //             "liability weight init {}",
    //             I80F48::from_le_bytes(bank.config.liability_weight_init.value)
    //         );
    //         println!(
    //             "liability weight maint {}",
    //             I80F48::from_le_bytes(bank.config.liability_weight_maint.value)
    //         );

    //         let pubkey = Pubkey::from_str("9Bfew9kzE83H8gPS7coUUzhytRhnJ1U2pzuaW2TTcKVD").unwrap();
    //         match client.get_account(&pubkey) {
    //             Ok(account_info) => {
    //                 let marginfi_account = bytemuck::from_bytes::<MarginfiAccount>(
    //                     &account_info.data.borrow()
    //                 );
    //                 println!("{:?}", marginfi_account);

    //                 let shares = I80F48::from_le_bytes(
    //                     marginfi_account.lending_account.balances[0].asset_shares.value
    //                 );
    //                 println!(
    //                     "account asset shares {}",
    //                     shares
    //                 );

    //                 let calculated_shares = shares * I80F48::from_le_bytes(bank.asset_share_value.value);
    //                 println!("calculated shares {}", calculated_shares);

    //                 println!("as u64: {}", i80f48_to_u64(calculated_shares));
    //                 println!("test {}", i80f48_to_f64(calculated_shares) as u64);

    //             }
    //             Err(e) => println!("An error occurred: {}", e),
    //         }

    //     }
    //     Err(e) => println!("An error occurred: {}", e),
    // }

    // // let supply = Pubkey::from_str("CCKtUs6Cgwo4aaQUmBPmyoApH2gUDErxNZCAntD6LYGh").unwrap(); // SOL
    // // let debt = Pubkey::from_str("2s37akK2eyBbp8DZgCm7RtsaEz8eJP3Nxd4urLHQv7yB").unwrap(); // USDC

    // // let supply_bank = client.get_account(&supply).expect("should work");
    // // let debt_bank = client.get_account(&debt).expect("should work");

    // // let supply_acc = bytemuck::from_bytes::<Bank>(&supply_bank.data.borrow());
    // // let debt_acc = bytemuck::from_bytes::<Bank>(&debt_bank.data.borrow());

    // // println!(
    // //     "{}",
    // //     math_utils::i80f48_to_f64(I80F48::from_le_bytes(supply_acc.config.asset_weight_init.value))
    // // );
    // // println!(
    // //     "{}",
    // //     math_utils::i80f48_to_f64(
    // //         I80F48::from_le_bytes(debt_acc.config.liability_weight_init.value)
    // //     )
    // // );

    // // let max_ltv = math_utils
    // //     ::i80f48_to_f64(I80F48::from_le_bytes(supply_acc.config.asset_weight_init.value))
    // //     .div(
    // //         math_utils::i80f48_to_f64(
    // //             I80F48::from_le_bytes(debt_acc.config.liability_weight_init.value)
    // //         )
    // //     );

    // // let liq_threshold = math_utils
    // //     ::i80f48_to_f64(I80F48::from_le_bytes(supply_acc.config.asset_weight_maint.value))
    // //     .div(
    // //         math_utils::i80f48_to_f64(
    // //             I80F48::from_le_bytes(debt_acc.config.liability_weight_maint.value)
    // //         )
    // //     );

    // // println!("{}, {}", max_ltv, liq_threshold);
}
