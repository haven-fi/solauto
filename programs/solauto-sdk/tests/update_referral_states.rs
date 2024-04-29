pub mod test_utils;

#[cfg(test)]
mod update_referral_states {
    use std::str::FromStr;

    use borsh::BorshDeserialize;
    use solana_program_test::tokio;
    use solana_sdk::{
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    };
    use solauto_sdk::generated::accounts::ReferralStateAccount;

    use crate::test_utils::*;

    #[tokio::test]
    async fn update_referral_states() {
        let mut data = MarginfiTestData::new(
            None,
            None,
            None,
            None,
            Some(&Pubkey::from_str(USDC_MINT).unwrap())
        ).await;

        let tx = Transaction::new_signed_with_payer(
            &[data.general.update_referral_states().instruction()],
            Some(&data.general.ctx.payer.pubkey()),
            &[&data.general.ctx.payer],
            data.general.ctx.last_blockhash
        );
        data.general.ctx.banks_client.process_transaction(tx).await.unwrap();

        let referral_state_data = data.general.get_account_data::<ReferralStateAccount>(
            data.general.signer_referral_state.clone()
        ).await;
        assert!(referral_state_data.authority == data.general.ctx.payer.pubkey());
        assert!(referral_state_data.referred_by_state == None);
        assert!(referral_state_data.dest_fees_mint == data.general.referral_fees_dest_mint);

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
        assert!(referral_state_data.referred_by_state.as_ref().unwrap() == &referred_by_state);
    }

    // Incorrect signer according to other accounts (ensure it fails)

    // For different accounts, used in the instruction, pass in Pubkey::default() (one at a time) and ensure it fails
}
