pub mod test_utils;

#[cfg(test)]
mod general {
    use solana_program_test::tokio;
    use solana_sdk::{
        rent::Rent, signer::Signer, system_instruction, transaction::Transaction
    };

    use crate::test_utils::*;

    #[tokio::test]
    async fn test_solauto_position_dos_attack() {
        let args = GeneralArgs::new();
        let mut data = MarginfiTestData::new(&args).await;
        data.general
            .test_prefixtures().await
            .unwrap()
            .create_referral_state_accounts().await
            .unwrap();

        let rent = Rent::default();
        let space = 2000;

        // Prefund wallet address with lamports
        let tx = Transaction::new_signed_with_payer(
            &[
                system_instruction::transfer(
                    &data.general.ctx.payer.pubkey(),
                    &data.general.solauto_position,
                    rent.minimum_balance(space)
                ),
            ],
            Some(&data.general.ctx.payer.pubkey()),
            &[&data.general.ctx.payer],
            data.general.ctx.last_blockhash
        );
        data.general.ctx.banks_client.process_transaction(tx).await.unwrap();

        data.open_position(Some(data.general.default_setting_params.clone()), None).await.unwrap();
    }
}
