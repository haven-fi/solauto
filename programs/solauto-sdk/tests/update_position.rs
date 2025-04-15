pub mod test_utils;

#[cfg(test)]
mod update_position {
    use chrono::Utc;
    use solana_program_test::tokio;
    use solana_sdk::{
        instruction::InstructionError,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    };
    use solauto_sdk::generated::{
        accounts::SolautoPosition,
        types::{ AutomationSettingsInp, DCASettingsInp, SolautoSettingsParametersInp, TokenType },
    };
    use spl_associated_token_account::get_associated_token_address;

    use crate::{ assert_instruction_error, test_utils::* };

    #[tokio::test]
    async fn update_settings_and_dca() {
        let args = GeneralArgs::new();
        let mut data = MarginfiTestData::new(&args).await;
        data.test_prefixtures().await
            .unwrap()
            .general.create_referral_state_accounts().await
            .unwrap();

        let dca_amount = 50_000;
        data.general
            .mint_tokens_to_ta(
                data.general.debt_mint,
                data.general.signer_debt_ta,
                dca_amount
            ).await
            .unwrap();

        data.open_position(
            Some(data.general.default_settings.clone()),
            None
        ).await.unwrap();

        let solauto_position = data.general.deserialize_account_data::<SolautoPosition>(
            data.general.solauto_position
        ).await;
        // TODO: DCA
        // assert!(solauto_position.position.dca.automation.target_periods == 0);
        // assert!(solauto_position.position.dca.dca_in_base_unit == 0);

        // // Update position's settings and add a DCA
        // let dca_out_automation = AutomationSettingsInp {
        //     unix_start_date: (Utc::now().timestamp() as u64) - 1,
        //     interval_seconds: 60 * 60 * 10,
        //     periods_passed: 0,
        //     target_periods: 5,
        // };
        // let new_settings = SolautoSettingsParametersInp {
        //     boost_to_bps: 2000,
        //     boost_gap: 1000,
        //     repay_to_bps: 7500,
        //     repay_gap: 500,
        // };
        // let new_dca = DCASettingsInp {
        //     automation: dca_out_automation,
        //     dca_in_base_unit: 0,
        //     token_type: TokenType::Debt
        // };
        // data.general
        //     .update_position(Some(new_settings.clone()), Some(new_dca.clone())).await
        //     .unwrap();

        // let solauto_position = data.general.deserialize_account_data::<SolautoPosition>(
        //     data.general.solauto_position
        // ).await;
        // assert!(solauto_position.position.dca.dca_in_base_unit == new_dca.dca_in_base_unit);
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
            &[
                data.general
                    .update_position_ix(Some(data.general.default_settings.clone()), None)
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

    #[tokio::test]
    async fn incorrect_token_account() {
        let args = GeneralArgs::new();
        let mut data = MarginfiTestData::new(&args).await;
        data.test_prefixtures().await
            .unwrap()
            .general.create_referral_state_accounts().await
            .unwrap();

        data.open_position(Some(data.general.default_settings.clone()), None).await.unwrap();

        let temp_wallet = Keypair::new().pubkey();
        let fake_debt_ta = get_associated_token_address(
            &temp_wallet,
            &data.general.debt_mint.pubkey()
        );
        data.general.create_ata(temp_wallet, data.general.debt_mint).await.unwrap();

        let dca_automation = AutomationSettingsInp {
            unix_start_date: (Utc::now().timestamp() as u64) - 1,
            interval_seconds: 60 * 60 * 10,
            periods_passed: 0,
            target_periods: 5,
        };
        let new_dca = DCASettingsInp {
            automation: dca_automation,
            dca_in_base_unit: 0,
            token_type: TokenType::Debt
        };
        let err = data.general
            .execute_instructions(
                vec![
                    data.general
                        .update_position_ix(None, Some(new_dca))
                        .position_dca_ta(Some(fake_debt_ta))
                        .instruction()
                ],
                None
            ).await
            .unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(0));
    }
}
