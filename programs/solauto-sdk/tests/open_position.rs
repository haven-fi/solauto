pub mod test_utils;

#[cfg(test)]
mod open_position {
    use std::str::FromStr;
    use solana_program_test::tokio;
    use solana_sdk::{ pubkey::Pubkey, signature::Signer, transaction::Transaction };

    use crate::test_utils::*;

    // TODO create general test module for testing update referral state tests

    #[tokio::test]
    async fn marginfi_open_position() {
        let mut data = MarginfiTestData::new(
            None,
            None,
            None,
            Some(&Pubkey::from_str(USDC_MINT).unwrap()),
            None
        ).await;

        let tx = Transaction::new_signed_with_payer(
            &[data.general.update_referral_states().instruction()],
            Some(&data.general.ctx.payer.pubkey()),
            &[&data.general.ctx.payer],
            data.general.ctx.last_blockhash
        );
        data.general.ctx.banks_client.process_transaction(tx).await.unwrap();

        // match data.general.ctx.banks_client.process_transaction(tx).await {
        //     Err(err) => {
        //         eprintln!("Transaction failed: {:?}", err);
        //         // Throw error?
        //     }
        //     Ok(_) => {}
        // }

    }
}
