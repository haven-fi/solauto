pub mod utils;

use solana_program_test::{tokio, ProgramTest};

use solauto_sdk::SOLAUTO_ID;

#[cfg(test)]
mod open_position {
    use super::*;
    
    #[tokio::test]
    async fn marginfi_open_position() {
        let context = ProgramTest::new("solauto", SOLAUTO_ID, None).start_with_context().await;

        // let asset = Keypair::new();

        // let mut attributes = AttributesBuilder::default();
        // attributes.add("hat", "nifty");
        // let data = attributes.data();

        // let ix = AllocateBuilder::new()
        //     .asset(asset.pubkey())
        //     .payer(Some(context.payer.pubkey()))
        //     .system_program(Some(system_program::id()))
        //     .extension(ExtensionInput {
        //         extension_type: ExtensionType::Attributes,
        //         length: data.len() as u32,
        //         data: Some(data),
        //     })
        //     .instruction();

        // let tx = Transaction::new_signed_with_payer(
        //     &[ix],
        //     Some(&context.payer.pubkey()),
        //     &[&context.payer, &asset],
        //     context.last_blockhash,
        // );
        // context.banks_client.process_transaction(tx).await.unwrap();

        // let account = context.banks_client.get_account(asset.pubkey()).await.unwrap();
        // assert!(account.is_some());
        // let account = account.unwrap();

        assert_eq!(1, 2, "should be equal");
    }
}    
