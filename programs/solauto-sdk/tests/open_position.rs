pub mod test_utils;

#[cfg(test)]
mod open_position {
    use std::str::FromStr;
    use solana_program_test::{ processor, tokio, ProgramTest };
    use solana_sdk::{ pubkey::Pubkey, signature::{ Keypair, Signer }, transaction::Transaction };

    use solauto_sdk::{ SOLAUTO_ID, generated::instructions::MarginfiOpenPositionBuilder };

    use crate::test_utils;

    #[tokio::test]
    async fn marginfi_open_position() {
        let supply_mint = Pubkey::from_str(test_utils::WSOL_MINT).expect("Should work");
        let debt_mint = Pubkey::from_str(test_utils::USDC_MINT).expect("Should work");
        let referred_by_authority = Keypair::new().pubkey();
        let position_id = 1;
        let accounts = test_utils::MarginfiAccounts::get(
            position_id,
            &supply_mint,
            &debt_mint,
            &Some(referred_by_authority)
        );

        let mut solauto = ProgramTest::new("solauto", SOLAUTO_ID, None);
        solauto.add_program(
            "marginfi",
            accounts.standard.program,
            processor!(test_utils::empty_instruction_processor)
        );
        let mut context = solauto.start_with_context().await;

        let ix = MarginfiOpenPositionBuilder::new()
            .signer(accounts.standard.signer.pubkey())
            .marginfi_program(accounts.standard.program)
            .solauto_fees_wallet(accounts.standard.solauto_fees_wallet)
            .solauto_fees_supply_ta(accounts.standard.solauto_fees_supply_ta)
            .instruction();

        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&context.payer.pubkey()),
            &[&accounts.standard.signer],
            context.last_blockhash
        );
        context.banks_client.process_transaction(tx).await.unwrap();

        // let account = context.banks_client.get_account(asset.pubkey()).await.unwrap();
        // assert!(account.is_some());
        // let account = account.unwrap();

        // let account_data = account.data.as_ref();
        // let asset_account = Asset::load(account_data);

        assert_eq!(1, 2, "should be equal");
    }
}
