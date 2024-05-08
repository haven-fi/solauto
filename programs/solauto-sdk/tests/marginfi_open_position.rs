pub mod test_utils;

#[cfg(test)]
mod open_position {
    use chrono::Utc;
    use solana_program_test::tokio;
    use solana_sdk::{
        instruction::InstructionError,
        signature::{ Keypair, Signer },
        transaction::Transaction,
    };
    use solauto_sdk::generated::{
        accounts::SolautoPosition,
        types::{ DCADirection, DCASettings, LendingPlatform, SolautoSettingsParameters },
    };
    use spl_associated_token_account::get_associated_token_address;
    use spl_token::state::Account as TokenAccount;

    use crate::{ assert_instruction_error, test_utils::* };

    #[tokio::test]
    async fn std_open_position() {
        let args = GeneralArgs::new();
        let mut data = MarginfiTestData::new(&args).await;
        data.general
            .test_prefixtures().await
            .unwrap()
            .create_referral_state_accounts().await
            .unwrap();

        let setting_params = SolautoSettingsParameters {
            repay_from_bps: 9500,
            repay_to_bps: 9000,
            boost_from_bps: 4500,
            boost_to_bps: 5000,
        };
        data.open_position(Some(setting_params.clone()), None).await.unwrap();

        let solauto_position = data.general.deserialize_account_data::<SolautoPosition>(
            data.general.solauto_position
        ).await;

        assert!(solauto_position.self_managed == false);
        assert!(solauto_position.position_id == data.general.position_id);
        assert!(solauto_position.authority == data.general.ctx.payer.pubkey());

        let position = solauto_position.position.as_ref().unwrap();
        assert!(position.setting_params == Some(setting_params));
        assert!(position.active_dca == None);
        assert!(position.lending_platform == LendingPlatform::Marginfi);
        assert!(position.protocol_data.supply_mint == data.general.supply_liquidity_mint.pubkey());
        assert!(
            position.protocol_data.debt_mint ==
                data.general.debt_liquidity_mint.map_or_else(
                    || None,
                    |mint| Some(mint.pubkey())
                )
        );
        assert!(position.protocol_data.protocol_account == data.marginfi_account);
    }

    #[tokio::test]
    async fn open_self_managed_position() {
        let mut args = GeneralArgs::new();
        args.position_id(0);
        let mut data = MarginfiTestData::new(&args).await;
        data.general
            .test_prefixtures().await
            .unwrap()
            .create_referral_state_accounts().await
            .unwrap();

        data.open_position(None, None).await.unwrap();

        let solauto_position = data.general.deserialize_account_data::<SolautoPosition>(
            data.general.solauto_position
        ).await;
        assert!(solauto_position.position_id == 0);
        assert!(solauto_position.self_managed == true);
        assert!(solauto_position.position.is_none());
    }

    #[tokio::test]
    async fn std_open_position_with_dca() {
        let args = GeneralArgs::new();
        let mut data = MarginfiTestData::new(&args).await;
        data.general
            .test_prefixtures().await
            .unwrap()
            .create_referral_state_accounts().await
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
                data.general.ctx.payer.pubkey(),
                dca_amount
            ).await
            .unwrap();

        let active_dca = DCASettings {
            unix_start_date: Utc::now().timestamp() as u64,
            unix_dca_interval: 60 * 60 * 24,
            dca_periods_passed: 0,
            target_dca_periods: 5,
            dca_direction: DCADirection::In(dca_amount),
            dca_risk_aversion_bps: None,
        };
        data.open_position(
            Some(data.general.default_setting_params.clone()),
            Some(active_dca.clone())
        ).await.unwrap();

        let position_account = data.general.deserialize_account_data::<SolautoPosition>(
            data.general.solauto_position
        ).await;
        let position = position_account.position.as_ref().unwrap();
        assert!(
            position.active_dca.is_some() && position.active_dca.as_ref().unwrap() == &active_dca
        );
        assert!(position.debt_ta_balance == dca_amount);

        let position_debt_ta = data.general.unpack_account_data::<TokenAccount>(
            data.general.position_debt_liquidity_ta.as_ref().unwrap().clone()
        ).await;
        assert!(position_debt_ta.amount == dca_amount);
    }

    #[tokio::test]
    async fn incorrect_signer() {
        let temp_account = Keypair::new();
        let mut args = GeneralArgs::new();
        args.fund_account(temp_account.pubkey());
        let mut data = MarginfiTestData::new(&args).await;
        data.general
            .test_prefixtures().await
            .unwrap()
            .create_referral_state_accounts().await
            .unwrap();

        let tx = Transaction::new_signed_with_payer(
            &[
                data
                    .open_position_ix(Some(data.general.default_setting_params.clone()), None)
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
    async fn incorrect_token_accounts() {
        let args = GeneralArgs::new();
        let mut data = MarginfiTestData::new(&args).await;
        data.general
            .test_prefixtures().await
            .unwrap()
            .create_referral_state_accounts().await
            .unwrap();

        let mut open_position_ix = data.open_position_ix(
            Some(data.general.default_setting_params.clone()),
            None
        );

        // Correct mint, incorrect wallet
        let fake_supply_ta = get_associated_token_address(
            &data.general.ctx.payer.pubkey(),
            &data.general.supply_liquidity_mint.pubkey()
        );
        let err = data.general
            .execute_instructions(
                &[open_position_ix.position_supply_ta(fake_supply_ta).instruction()],
                None
            ).await
            .unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(2));

        // Correct wallet, incorrect mint
        let fake_supply_ta = get_associated_token_address(
            &data.general.solauto_position,
            &data.general.debt_liquidity_mint.unwrap().pubkey()
        );
        let err = data.general
            .execute_instructions(
                &[open_position_ix.position_supply_ta(fake_supply_ta).instruction()],
                None
            ).await
            .unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(2));

        // Correct mint, incorrect wallet
        let fake_debt_ta = get_associated_token_address(
            &data.general.ctx.payer.pubkey(),
            &data.general.debt_liquidity_mint.unwrap().pubkey()
        );
        let err = data.general
            .execute_instructions(
                &[open_position_ix.position_debt_ta(Some(fake_debt_ta)).instruction()],
                None
            ).await
            .unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(2));

        // Correct wallet, incorrect mint
        let fake_debt_ta = get_associated_token_address(
            &data.general.solauto_position,
            &data.general.supply_liquidity_mint.pubkey()
        );
        let err = data.general
            .execute_instructions(
                &[open_position_ix.position_debt_ta(Some(fake_debt_ta)).instruction()],
                None
            ).await
            .unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(2));
    }

    // pub async fn test_settings(data: &mut MarginfiTestData<'_>, settings: SolautoSettingsParameters) {
    //     let tx = Transaction::new_signed_with_payer(
    //         &[data.open_position_ix(Some(settings), None).instruction()],
    //         Some(&data.general.ctx.payer.pubkey()),
    //         &[&data.general.ctx.payer],
    //         data.general.ctx.last_blockhash
    //     );
    //     let err = data.general.ctx.banks_client.process_transaction(tx).await.unwrap_err();
    //     assert_instruction_error!(err, InstructionError::Custom(4));
    // }

    // #[tokio::test]
    // async fn invalid_settings() {
    //     let args = GeneralArgs::new();
    //     let mut data = MarginfiTestData::new(&args).await;
    //     data.general
    //         .test_prefixtures().await
    //         .unwrap()
    //         .create_referral_state_accounts().await
    //         .unwrap();

    //     test_settings(&mut data, SolautoSettingsParameters {
    //         repay_from_bps: 9500,
    //         repay_to_bps: 9000,
    //         boost_from_bps: 4500,
    //         boost_to_bps: 4499,
    //     }).await;
    // }
}
