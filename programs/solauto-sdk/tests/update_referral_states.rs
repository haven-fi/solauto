pub mod test_utils;

#[cfg(test)]
mod update_referral_states {

    use solana_program_test::tokio;
    use solana_sdk::{
        instruction::InstructionError,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    };
    use solauto::constants::WSOL_MINT;
    use solauto_sdk::generated::accounts::ReferralState;

    use crate::{ assert_instruction_error, test_utils::* };

    #[tokio::test]
    async fn update_referral_states() {
        // Create referral state for signer
        let args = GeneralArgs::new();
        let mut data = MarginfiTestData::new(&args).await;

        data.general
            .execute_instructions(
                vec![data.general.update_referral_states_ix().instruction()],
                None
            ).await
            .unwrap();

        let signer_referral_state_data =
            data.general.deserialize_account_data::<ReferralState>(
                data.general.signer_referral_state.clone()
            ).await;
        
        assert!(signer_referral_state_data.authority == data.general.ctx.payer.pubkey());
        assert!(signer_referral_state_data.referred_by_state == Pubkey::default());
        assert!(signer_referral_state_data.dest_fees_mint == data.general.referral_fees_dest_mint.pubkey());

        // Check if able to set the referred_by_state even after signer referral state has been created
        let referred_by_authority = Keypair::new().pubkey();
        let referred_by_state = GeneralTestData::get_referral_state(&referred_by_authority);

        data.general
            .execute_instructions(
                vec![
                    data.general
                        .update_referral_states_ix()
                        .referred_by_authority(Some(referred_by_authority))
                        .referred_by_state(Some(referred_by_state))
                        .instruction(),
                ],
                None
            ).await
            .unwrap();

        let referred_by_state_data = data.general.deserialize_account_data::<ReferralState>(
            referred_by_state.clone()
        ).await;
        assert!(referred_by_state_data.authority == referred_by_authority);
        assert!(referred_by_state_data.referred_by_state == Pubkey::default());
        assert!(referred_by_state_data.dest_fees_mint == WSOL_MINT);

        let signer_referral_state_data =
            data.general.deserialize_account_data::<ReferralState>(
                data.general.signer_referral_state.clone()
            ).await;
        assert!(
            signer_referral_state_data.referred_by_state == referred_by_state
        );


        // Ensure referred_by_state cannot be overwritten after it has been set
        let referred_by_authority2 = Keypair::new().pubkey();
        let referred_by_state2 = GeneralTestData::get_referral_state(&referred_by_authority2);

        let err = data.general
            .execute_instructions(
                vec![
                    data.general
                        .update_referral_states_ix()
                        .referred_by_authority(Some(referred_by_authority2))
                        .referred_by_state(Some(referred_by_state2))
                        .instruction(),
                ],
                None
            ).await
            .unwrap_err();



        assert_instruction_error!(err, InstructionError::Custom(0));
    }

    #[tokio::test]
    async fn incorrect_signer() {
        let temp_account = Keypair::new();
        let mut args = GeneralArgs::new();
        args.fund_account(temp_account.pubkey());
        let mut data = MarginfiTestData::new(&args).await;

        let tx = Transaction::new_signed_with_payer(
            &[data.general.update_referral_states_ix().signer(temp_account.pubkey()).instruction()],
            Some(&temp_account.pubkey()),
            &[&temp_account],
            data.general.ctx.last_blockhash
        );

        data.general.ctx.banks_client.process_transaction(tx).await.unwrap_err();
    }
}
