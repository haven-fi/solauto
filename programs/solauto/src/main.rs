// use solana_program::program_pack::Pack;
// use solana_program::pubkey::Pubkey;
// use serde_json::json;
// use solauto_sdk::state::{test, DeserializedAccount, Position};
// use solend_sdk::math::{ TryDiv, BPS_SCALER, U192, WAD };
// use std::result::Result;
// use std::str::FromStr;
// use std::mem;
// use solend_sdk::state::{ Obligation, Reserve };
// use serde::{ Deserialize, Serialize };
// use serde::{ Deserializer, de::Error as DeError };

// use solauto::utils::math_utils::{ decimal_to_f64, decimal_to_f64_div_wad };

// // Custom deserializer for the base64-encoded data
// fn decode_base64<'de, D>(deserializer: D) -> Result<Vec<u8>, D::Error> where D: Deserializer<'de> {
//     let s = String::deserialize(deserializer)?;
//     base64::decode(&s).map_err(DeError::custom)
// }

// #[derive(Serialize, Deserialize, Debug)]
// struct ApiResponse {
//     jsonrpc: String,
//     result: ResultField,
//     id: u64,
// }

// #[derive(Serialize, Deserialize, Debug)]
// struct ResultField {
//     context: Context,
//     value: AccountInfo,
// }

// #[derive(Serialize, Deserialize, Debug)]
// struct Context {
//     apiVersion: String,
//     slot: u64,
// }

// #[derive(Serialize, Deserialize, Debug)]
// struct AccountInfo {
//     data: Vec<String>, // First element is the base64-encoded data
//     executable: bool,
//     lamports: u64,
//     owner: String,
//     rentEpoch: u64,
//     space: u64,
// }

// #[derive(Debug)]
// enum MyError {
//     Reqwest(reqwest::Error),
//     Decode(base64::DecodeError),
//     Unpack(solana_program::program_error::ProgramError), // Assuming ProgramError is already defined in your context
//     // You can add more error types as needed
// }

// impl std::fmt::Display for MyError {
//     fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
//         write!(f, "{:?}", self)
//     }
// }

// impl std::error::Error for MyError {}

// impl From<reqwest::Error> for MyError {
//     fn from(err: reqwest::Error) -> MyError {
//         MyError::Reqwest(err)
//     }
// }

// impl From<base64::DecodeError> for MyError {
//     fn from(err: base64::DecodeError) -> MyError {
//         MyError::Decode(err)
//     }
// }

// // Assuming `ProgramError` is the error type from your context
// impl From<solana_program::program_error::ProgramError> for MyError {
//     fn from(err: solana_program::program_error::ProgramError) -> MyError {
//         MyError::Unpack(err)
//     }
// }

// async fn get_account(account_pubkey: Pubkey) -> Result<Vec<u8>, MyError> {
//     let rpc_url = "https://api.mainnet-beta.solana.com";

//     let client = reqwest::Client::new();
//     let request_body =
//         json!({
//         "jsonrpc": "2.0",
//         "id": 1,
//         "method": "getAccountInfo",
//         "params": [
//             account_pubkey.to_string(),
//             {
//                 "encoding": "base64"
//             }
//         ]
//     });

//     let response = client.post(rpc_url).json(&request_body).send().await?;

//     let response_text = response.text().await?;
//     let api_response: ApiResponse = serde_json::from_str(&response_text).unwrap();

//     let base64_data = &api_response.result.value.data[0]; // Access the base64 string
//     let decoded_data = base64::decode(base64_data).expect("Failed to decode base64 data");

//     Ok(decoded_data)
// }

// #[tokio::main]
// async fn main() -> Result<(), MyError> {
//     let reserve_data = get_account(
//         // Pubkey::from_str("8PbodeaosQP19SjYFx855UMqWxH2HynZLdBXmsrbac36").unwrap() // SOL
//         Pubkey::from_str("BgxfHJDzm44T7XG68MYKx7YisTjZu73tVovyZSjJMpmw").unwrap() // USDC
//         // Pubkey::from_str("8K9WC8xoh2rtQNY7iEGXtPvfbDCi563SdWhCAhuMP2xE").unwrap() // USDT
//     ).await?; // reserve
//     let obligation_data = get_account(
//         Pubkey::from_str("94h74NyQRX6waYiJGJAGNFkwdbFkWrysK381ttKPkEQK").unwrap()
//     ).await?; // obligation

//     let reserve = Reserve::unpack(&reserve_data)?;
//     let obligation = Obligation::unpack(&obligation_data)?;

//     println!("{:?}", reserve);
//     println!("{:?}", obligation);

//     Ok(())
// }

// #[tokio::main]
// async fn main() -> Result<(), MyError> {
//     let position_data = get_account(
//         Pubkey::from_str("AwgtJe3D9bhBHLB3T3gmxTtcpd2F3tytTmyNY29ZqcwS").unwrap()
//     ).await?;

//     test(position_data.as_slice());

//     Ok(())
// }

fn main() {}