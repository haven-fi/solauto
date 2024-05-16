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

        // TODO
    }
}
