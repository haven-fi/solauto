pub mod test_utils;

#[cfg(test)]
mod claim_referral_fees {
    use solana_program_test::tokio;
    use solana_sdk::{
        instruction::InstructionError,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    };
    use spl_associated_token_account::get_associated_token_address;

    use crate::{ assert_instruction_error, test_utils::* };

    #[tokio::test]
    async fn claim_referral_fees() {
        let args = GeneralArgs::new();
        let mut data = MarginfiTestData::new(&args).await;
        data.test_prefixtures().await
            .unwrap()
            .general.create_referral_state_accounts().await
            .unwrap();
        data.general
            .create_ata(data.general.ctx.payer.pubkey(), data.general.referral_fees_dest_mint).await
            .unwrap();
        data.general
            .create_ata(
                data.general.signer_referral_state,
                data.general.referral_fees_dest_mint
            ).await
            .unwrap();

        let fees_amount = 324549;
        data.general
            .mint_tokens_to_ta(
                data.general.referral_fees_dest_mint,
                data.general.signer_referral_dest_ta,
                fees_amount
            ).await
            .unwrap();

        data.general.claim_referral_fees().await.unwrap();
    }

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

        let tx = Transaction::new_signed_with_payer(
            &[data.general.claim_referral_fees_ix().signer(temp_account.pubkey()).instruction()],
            Some(&temp_account.pubkey()),
            &[&temp_account],
            data.general.ctx.last_blockhash
        );
        let err = data.general.ctx.banks_client.process_transaction(tx).await.unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(0));
    }

    #[tokio::test]
    async fn incorrect_signer_referral_state() {
        let args = GeneralArgs::new();

        let mut data = MarginfiTestData::new(&args).await;
        data.general.create_referral_state_accounts().await.unwrap();

        let fake_referral_state_account = data.general.signer_referral_state;

        let mut data = MarginfiTestData::new(&args).await;
        data
            .test_prefixtures().await
            .unwrap()
            .general.create_referral_state_accounts().await
            .unwrap();
        data.general
            .create_ata(
                data.general.ctx.payer.pubkey(),
                data.general.referral_fees_dest_mint
            ).await
            .unwrap();
        data.general
            .create_ata(
                data.general.signer_referral_state,
                data.general.referral_fees_dest_mint
            ).await
            .unwrap();

        // Try claim referral fees on data1's referral state
        let err = data.general
            .execute_instructions(
                vec![
                    data.general
                        .claim_referral_fees_ix()
                        .referral_state(fake_referral_state_account)
                        .instruction()
                ],
                None
            ).await
            .unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(0));
    }

    #[tokio::test]
    async fn incorrect_token_accounts() {
        let args = GeneralArgs::new();
        let mut data = MarginfiTestData::new(&args).await;
        data.test_prefixtures().await
            .unwrap()
            .general.create_referral_state_accounts().await
            .unwrap();
        data.general
            .create_ata(data.general.ctx.payer.pubkey(), data.general.referral_fees_dest_mint).await
            .unwrap();

        let temp_wallet = Keypair::new().pubkey();
        let fake_dest_ta = get_associated_token_address(
            &temp_wallet,
            &data.general.referral_fees_dest_mint.pubkey()
        );
        data.general.create_ata(temp_wallet, data.general.referral_fees_dest_mint).await.unwrap();

        let err = data.general
            .execute_instructions(
                vec![
                    data.general
                        .claim_referral_fees_ix()
                        .referral_fees_dest_ta(fake_dest_ta)
                        .instruction()
                ],
                None
            ).await
            .unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(0));
    }
}
