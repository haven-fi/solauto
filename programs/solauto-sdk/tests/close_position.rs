pub mod test_utils;

#[cfg(test)]
mod close_position {
    use solana_program_test::tokio;
    use solana_sdk::{
        instruction::InstructionError,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    };
    use spl_token::state::Account as TokenAccount;
    use spl_associated_token_account::get_associated_token_address;

    use crate::{ assert_instruction_error, test_utils::* };

    #[tokio::test]
    async fn std_close_position() {
        let args = GeneralArgs::new();
        let mut data = MarginfiTestData::new(&args).await;
        data.test_prefixtures().await
            .unwrap()
            .general.create_referral_state_accounts().await
            .unwrap();
        data.open_position(Some(data.general.default_settings.clone()), None).await.unwrap();

        let current_supply_balance = 3445655;
        data.general
            .mint_tokens_to_ta(
                data.general.supply_mint,
                data.general.position_supply_ta,
                current_supply_balance
            ).await
            .unwrap();
        let current_debt_balance = 34543;
        data.general
            .mint_tokens_to_ta(
                data.general.debt_mint,
                data.general.position_debt_ta,
                current_debt_balance
            ).await
            .unwrap();

        data.general.close_position().await.unwrap();

        let solauto_position = data.general.ctx.banks_client
            .get_account(data.general.solauto_position).await
            .unwrap();
        assert!(solauto_position.is_none());

        let position_supply_ta = data.general.ctx.banks_client
            .get_account(data.general.position_supply_ta).await
            .unwrap();
        assert!(position_supply_ta.is_none());

        let position_debt_ta = data.general.ctx.banks_client
            .get_account(data.general.position_debt_ta).await
            .unwrap();
        assert!(position_debt_ta.is_none());

        let signer_supply_ta = data.general.unpack_account_data::<TokenAccount>(
            data.general.signer_supply_ta
        ).await;
        assert!(signer_supply_ta.amount == current_supply_balance);

        let signer_debt_ta = data.general.unpack_account_data::<TokenAccount>(
            data.general.signer_debt_ta
        ).await;
        assert!(signer_debt_ta.amount == current_debt_balance);
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
        data.open_position(Some(data.general.default_settings.clone()), None).await.unwrap();

        let tx = Transaction::new_signed_with_payer(
            &[data.general.close_position_ix().signer(temp_account.pubkey()).instruction()],
            Some(&temp_account.pubkey()),
            &[&temp_account],
            data.general.ctx.last_blockhash
        );
        let err = data.general.ctx.banks_client.process_transaction(tx).await.unwrap_err();
        assert_instruction_error!(err, InstructionError::MissingRequiredSignature);
    }

    #[tokio::test]
    async fn incorrect_token_accounts() {
        let args = GeneralArgs::new();
        let mut data = MarginfiTestData::new(&args).await;
        data.test_prefixtures().await
            .unwrap()
            .general.create_referral_state_accounts().await
            .unwrap();
        data.open_position(Some(data.general.default_settings.clone()), None).await.unwrap();

        let temp_account = Keypair::new();
        let fake_supply_ta = get_associated_token_address(
            &temp_account.pubkey(),
            &data.general.supply_mint.pubkey()
        );
        data.general.create_ata(temp_account.pubkey(), &data.general.supply_mint).await.unwrap();

        // Fake position supply token account
        let err = data.general
            .execute_instructions(
                vec![
                    data.general
                        .close_position_ix()
                        .position_supply_ta(fake_supply_ta)
                        .instruction()
                ],
                None
            ).await
            .unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(0));

        let temp_account = Keypair::new();
        let fake_debt_ta = get_associated_token_address(
            &temp_account.pubkey(),
            &data.general.debt_mint.pubkey()
        );
        data.general.create_ata(temp_account.pubkey(), &data.general.debt_mint).await.unwrap();

        // Fake position debt token account
        let err = data.general
            .execute_instructions(
                vec![data.general.close_position_ix().position_debt_ta(fake_debt_ta).instruction()],
                None
            ).await
            .unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(0));
    }
}
