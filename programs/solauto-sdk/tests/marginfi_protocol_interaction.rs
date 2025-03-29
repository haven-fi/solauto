pub mod test_utils;

#[cfg(test)]
mod marginfi_protocol_interaction {
    use solana_program_test::tokio;
    use solana_sdk::{
        instruction::InstructionError,
        signature::{ Keypair, Signer },
        transaction::Transaction,
    };
    use solauto_sdk::generated::types::SolautoAction;
    use crate::{ assert_instruction_error, test_utils::* };

    #[tokio::test]
    async fn incorrect_signer() {
        let temp_account = Keypair::new();
        let mut args = GeneralArgs::new();
        args.fund_account(temp_account.pubkey());
        let mut data = MarginfiTestData::new(&args).await;
        data.test_prefixtures().await
            .unwrap()
            .general.create_referral_state_accounts().await
            .unwrap();

        data.open_position(Some(data.general.default_settings.clone()), None).await.unwrap();

        let tx = Transaction::new_signed_with_payer(
            &[
                data
                    .protocol_interaction_ix(SolautoAction::Deposit(0))
                    .signer(temp_account.pubkey())
                    .instruction(),
            ],
            Some(&temp_account.pubkey()),
            &[&temp_account],
            data.general.ctx.last_blockhash
        );

        let err = data.general.ctx.banks_client.process_transaction(tx).await.unwrap_err();
        assert_instruction_error!(err, InstructionError::MissingRequiredSignature);
    }
}
