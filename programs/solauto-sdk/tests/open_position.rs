pub mod test_utils;

#[cfg(test)]
mod open_position {
    use solana_program_test::tokio;
    use solana_sdk::{ signature::Signer, transaction::Transaction };
    use solauto_sdk::generated::types::SolautoSettingsParameters;

    use crate::test_utils::*;

    #[tokio::test]
    async fn marginfi_open_position() {
        let mut data = MarginfiTestData::new(&GeneralArgs::new()).await;

        let setting_params = SolautoSettingsParameters {
            repay_from_bps: 95,
            repay_to_bps: 90,
            boost_from_bps: 45,
            boost_to_bps: 50,
        };
        let tx = Transaction::new_signed_with_payer(
            &[
                data.general.update_referral_states().instruction(),
                data.open_position(Some(setting_params), None).instruction(),
            ],
            Some(&data.general.ctx.payer.pubkey()),
            &[&data.general.ctx.payer],
            data.general.ctx.last_blockhash
        );
        data.general.ctx.banks_client.process_transaction(tx).await.unwrap();
    }
}
