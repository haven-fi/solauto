pub mod test_utils;

#[cfg(test)]
mod update_referral_states {
    use std::str::FromStr;

    use solana_program_test::tokio;
    use solana_sdk::{
        instruction::InstructionError,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    };
    use solauto_sdk::generated::accounts::ReferralStateAccount;

    use crate::{ assert_instruction_error, test_utils::* };

    #[tokio::test]
    async fn update_referral_states() {
        // Create referral state for signer
        let mut data = MarginfiTestData::new(
            GeneralArgs::new().referral_fees_dest_mint(Pubkey::from_str(USDC_MINT).unwrap())
        ).await;

        let tx = Transaction::new_signed_with_payer(
            &[data.general.update_referral_states().instruction()],
            Some(&data.general.ctx.payer.pubkey()),
            &[&data.general.ctx.payer],
            data.general.ctx.last_blockhash
        );
        data.general.ctx.banks_client.process_transaction(tx).await.unwrap();

        let signer_referral_state_data = data.general.get_account_data::<ReferralStateAccount>(
            data.general.signer_referral_state.clone()
        ).await;
        assert!(signer_referral_state_data.authority == data.general.ctx.payer.pubkey());
        assert!(signer_referral_state_data.referred_by_state == None);
        assert!(signer_referral_state_data.dest_fees_mint == data.general.referral_fees_dest_mint);

        // Check if able to set the referred_by_state even after signer referral state has been created
        let referred_by_authority = Keypair::new().pubkey();
        let referred_by_state = GeneralTestData::get_referral_state(&referred_by_authority);
        let tx = Transaction::new_signed_with_payer(
            &[
                data.general
                    .update_referral_states()
                    .referred_by_authority(Some(referred_by_authority))
                    .referred_by_state(Some(referred_by_state))
                    .instruction(),
            ],
            Some(&data.general.ctx.payer.pubkey()),
            &[&data.general.ctx.payer],
            data.general.ctx.last_blockhash
        );
        data.general.ctx.banks_client.process_transaction(tx).await.unwrap();

        let referred_by_state_data = data.general.get_account_data::<ReferralStateAccount>(
            referred_by_state.clone()
        ).await;
        assert!(referred_by_state_data.authority == referred_by_authority);
        assert!(referred_by_state_data.referred_by_state == None);
        assert!(referred_by_state_data.dest_fees_mint == Pubkey::from_str(WSOL_MINT).unwrap());

        let signer_referral_state_data = data.general.get_account_data::<ReferralStateAccount>(
            data.general.signer_referral_state.clone()
        ).await;
        assert!(signer_referral_state_data.referred_by_state.as_ref().unwrap() == &referred_by_state);

        // Ensure referred_by_state cannot be overwritten after it has been set
        let referred_by_authority2 = Keypair::new().pubkey();
        let referred_by_state2 = GeneralTestData::get_referral_state(&referred_by_authority2);
        let tx = Transaction::new_signed_with_payer(
            &[
                data.general
                    .update_referral_states()
                    .referred_by_authority(Some(referred_by_authority2))
                    .referred_by_state(Some(referred_by_state2))
                    .instruction(),
            ],
            Some(&data.general.ctx.payer.pubkey()),
            &[&data.general.ctx.payer],
            data.general.ctx.last_blockhash
        );
        let err = data.general.ctx.banks_client.process_transaction(tx).await.unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(2));
    }

    #[tokio::test]
    async fn incorrect_signer() {
        let temp_account = Keypair::new();
        let mut data = MarginfiTestData::new(
            &GeneralArgs::new().fund_account(temp_account.pubkey())
        ).await;

        let tx = Transaction::new_signed_with_payer(
            &[data.general.update_referral_states().signer(temp_account.pubkey()).instruction()],
            Some(&temp_account.pubkey()),
            &[&temp_account],
            data.general.ctx.last_blockhash
        );

        let err = data.general.ctx.banks_client.process_transaction(tx).await.unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(2));
    }

    #[tokio::test]
    async fn incorrect_signer_referral_state() {
        let mut data = MarginfiTestData::new(&GeneralArgs::new()).await;
        let tx = Transaction::new_signed_with_payer(
            &[
                data.general
                    .update_referral_states()
                    .signer_referral_state(Pubkey::default())
                    .instruction(),
            ],
            Some(&data.general.ctx.payer.pubkey()),
            &[&data.general.ctx.payer],
            data.general.ctx.last_blockhash
        );
        let err = data.general.ctx.banks_client.process_transaction(tx).await.unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(2));
    }
}
