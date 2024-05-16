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
        types::{ DCADirection, DCASettings, SolautoSettingsParameters },
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
        data.general
            .create_ata(
                data.general.ctx.payer.pubkey(),
                data.general.debt_liquidity_mint.unwrap()
            ).await
            .unwrap();

        let dca_amount = 50_000;
        data.general
            .mint_tokens_to_ta(
                data.general.debt_liquidity_mint.unwrap(),
                data.general.signer_debt_liquidity_ta.unwrap(),
                dca_amount
            ).await
            .unwrap();

        let active_dca = DCASettings {
            unix_start_date: Utc::now().timestamp() as u64,
            unix_dca_interval: 60 * 60 * 24,
            dca_periods_passed: 0,
            target_dca_periods: 5,
            dca_direction: DCADirection::In(Some(dca_amount)),
            dca_risk_aversion_bps: None,
            target_boost_to_bps: None,
        };
        data.open_position(
            Some(data.general.default_setting_params.clone()),
            Some(active_dca.clone())
        ).await.unwrap();

        let solauto_position = data.general.deserialize_account_data::<SolautoPosition>(
            data.general.solauto_position
        ).await;
        assert!(
            solauto_position.position.as_ref().unwrap().active_dca.as_ref().unwrap() == &active_dca
        );
        assert!(solauto_position.position.as_ref().unwrap().debt_ta_balance == dca_amount);

        // Update position's settings and add a DCA
        let new_settings = SolautoSettingsParameters {
            boost_to_bps: 2000,
            boost_gap: 1000,
            repay_to_bps: 8500,
            repay_gap: 1000,
        };
        let new_dca = DCASettings {
            unix_start_date: Utc::now().timestamp() as u64,
            unix_dca_interval: 60 * 60,
            dca_periods_passed: 0,
            target_dca_periods: 5,
            dca_direction: DCADirection::Out,
            dca_risk_aversion_bps: None,
            target_boost_to_bps: None,
        };
        data.general
            .update_position(Some(new_settings.clone()), Some(new_dca.clone())).await
            .unwrap();

        let solauto_position = data.general.deserialize_account_data::<SolautoPosition>(
            data.general.solauto_position
        ).await;
        assert!(
            solauto_position.position.as_ref().unwrap().setting_params.as_ref().unwrap() ==
                &new_settings
        );
        assert!(
            solauto_position.position.as_ref().unwrap().active_dca.as_ref().unwrap() == &new_dca
        );
        assert!(solauto_position.position.as_ref().unwrap().debt_ta_balance == 0);
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
        data.general
            .create_ata(
                data.general.ctx.payer.pubkey(),
                data.general.debt_liquidity_mint.unwrap()
            ).await
            .unwrap();
        data.open_position(Some(data.general.default_setting_params.clone()), None).await.unwrap();

        let tx = Transaction::new_signed_with_payer(
            &[
                data.general
                    .update_position_ix(Some(data.general.default_setting_params.clone()), None)
                    .signer(temp_account.pubkey())
                    .instruction(),
            ],
            Some(&temp_account.pubkey()),
            &[&temp_account],
            data.general.ctx.last_blockhash
        );
        let err = data.general.ctx.banks_client.process_transaction(tx).await.unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(0));
    }

    #[tokio::test]
    async fn incorrect_token_account() {
        let args = GeneralArgs::new();
        let mut data = MarginfiTestData::new(&args).await;
        data.test_prefixtures().await
            .unwrap()
            .general.create_referral_state_accounts().await
            .unwrap();

        data.open_position(Some(data.general.default_setting_params.clone()), None).await.unwrap();

        let temp_wallet = Keypair::new().pubkey();
        let fake_debt_ta = get_associated_token_address(
            &temp_wallet,
            &data.general.debt_liquidity_mint.unwrap().pubkey()
        );
        data.general
            .create_ata(temp_wallet, data.general.debt_liquidity_mint.unwrap()).await
            .unwrap();
    
        let err = data.general
            .execute_instructions(
                vec![
                    data.general
                        .update_position_ix(None, None)
                        .position_debt_ta(Some(fake_debt_ta))
                        .instruction()
                ],
                None
            ).await
            .unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(0));
    }
}
