pub mod test_utils;

#[cfg(test)]
mod general {
    use chrono::Utc;
    use solana_program_test::tokio;
    use solana_sdk::{
        instruction::InstructionError,
        program_pack::Pack,
        pubkey::Pubkey,
        rent::Rent,
        signature::Keypair,
        signer::Signer,
        system_instruction,
        transaction::Transaction,
    };
    use solauto_sdk::generated::{
        accounts::SolautoPosition,
        types::{ AutomationSettingsInp, DCASettingsInp },
    };
    use spl_associated_token_account::get_associated_token_address;
    use spl_token::state::Account as TokenAccount;

    use crate::{ assert_instruction_error, test_utils::* };

    #[tokio::test]
    async fn test_solauto_position_attack() {
        let args = GeneralArgs::new();
        let mut data = MarginfiTestData::new(&args).await;
        data.test_prefixtures().await
            .unwrap()
            .general.create_referral_state_accounts().await
            .unwrap();

        let rent = Rent::default();
        let space = 2000;

        // Prefund wallet address with lamports
        let tx = Transaction::new_signed_with_payer(
            &[
                system_instruction::transfer(
                    &data.general.ctx.payer.pubkey(),
                    &data.general.solauto_position,
                    rent.minimum_balance(space)
                ),
            ],
            Some(&data.general.ctx.payer.pubkey()),
            &[&data.general.ctx.payer],
            data.general.ctx.last_blockhash
        );
        data.general.ctx.banks_client.process_transaction(tx).await.unwrap();

        data.open_position(Some(data.general.default_setting_params.clone()), None).await.unwrap();
    }

    #[tokio::test]
    async fn test_ata_attack() {
        let args = GeneralArgs::new();
        let mut data = MarginfiTestData::new(&args).await;
        data.test_prefixtures().await
            .unwrap()
            .general.create_referral_state_accounts().await
            .unwrap();

        let rent = Rent::default();
        let space = 2000;

        // Prefund ata with lamports
        let tx = Transaction::new_signed_with_payer(
            &[
                system_instruction::transfer(
                    &data.general.ctx.payer.pubkey(),
                    &data.general.position_supply_ta,
                    rent.minimum_balance(space)
                ),
            ],
            Some(&data.general.ctx.payer.pubkey()),
            &[&data.general.ctx.payer],
            data.general.ctx.last_blockhash
        );
        data.general.ctx.banks_client.process_transaction(tx).await.unwrap();

        data.open_position(Some(data.general.default_setting_params.clone()), None).await.unwrap();

        let account = data.general.ctx.banks_client.get_account(data.general.position_supply_ta).await.unwrap();
        assert!(account.is_some());
        let position_supply_ta = TokenAccount::unpack(&mut account.unwrap().data.as_slice()).unwrap();

        assert!(position_supply_ta.owner == data.general.solauto_position);
        assert!(position_supply_ta.mint == data.general.supply_mint.pubkey());
    }

    #[tokio::test]
    async fn incorrect_solauto_position() {
        let args = GeneralArgs::new();
        let mut data = MarginfiTestData::new(&args).await;
        data.test_prefixtures().await
            .unwrap()
            .general.create_referral_state_accounts().await
            .unwrap();

        data.open_position(Some(data.general.default_setting_params.clone()), None).await.unwrap();
        let solauto_position = data.general.solauto_position.clone();

        let mut data = MarginfiTestData::new(&args).await;
        data.test_prefixtures().await
            .unwrap()
            .general.create_referral_state_accounts().await
            .unwrap();

        let err = data.general
            .execute_instructions(
                vec![
                    data
                        .open_position_ix(Some(data.general.default_setting_params.clone()), None)
                        // Pass incorrect solauto position for the given signer
                        .solauto_position(solauto_position)
                        .instruction(),
                ],
                None
            ).await
            .unwrap_err();

        assert_instruction_error!(err, InstructionError::MissingRequiredSignature);
    }

    #[tokio::test]
    async fn incorrect_solauto_fee_accounts() {
        let args = GeneralArgs::new();
        let mut data = MarginfiTestData::new(&args).await;
        data.test_prefixtures().await
            .unwrap()
            .general.create_referral_state_accounts().await
            .unwrap();

        let err = data.general
            .execute_instructions(
                vec![
                    data
                        .open_position_ix(Some(data.general.default_setting_params.clone()), None)
                        .solauto_fees_wallet(Pubkey::default())
                        .instruction(),
                ],
                None
            ).await
            .unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(0));

        // Incorrect wallet, correct token mint
        let fake_solauto_fees_supply_ta = get_associated_token_address(
            &data.general.ctx.payer.pubkey(),
            &data.general.supply_mint.pubkey()
        );
        let err = data.general
            .execute_instructions(
                vec![
                    data
                        .open_position_ix(Some(data.general.default_setting_params.clone()), None)
                        .solauto_fees_supply_ta(fake_solauto_fees_supply_ta)
                        .instruction(),
                ],
                None
            ).await
            .unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(0));

        // Correct wallet, incorrect token mint
        let fake_solauto_fees_supply_ta = get_associated_token_address(
            &data.general.solauto_fees_wallet,
            &data.general.debt_mint.pubkey()
        );
        let err = data.general
            .execute_instructions(
                vec![
                    data
                        .open_position_ix(Some(data.general.default_setting_params.clone()), None)
                        .solauto_fees_supply_ta(fake_solauto_fees_supply_ta)
                        .instruction(),
                ],
                None
            ).await
            .unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(0));
    }

    #[tokio::test]
    async fn cancel_dca() {
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

        let active_dca = DCASettingsInp {
            automation: AutomationSettingsInp {
                unix_start_date: (Utc::now().timestamp() as u64) - 1,
                interval_seconds: 60 * 60 * 24,
                periods_passed: 0,
                target_periods: 5,
            },
            debt_to_add_base_unit: dca_amount,
        };
        data.open_position(
            Some(data.general.default_setting_params.clone()),
            Some(active_dca.clone())
        ).await.unwrap();

        data.general
            .execute_instructions(vec![data.general.cancel_dca_ix().instruction()], None).await
            .unwrap();

        let solauto_position = data.general.deserialize_account_data::<SolautoPosition>(
            data.general.solauto_position
        ).await;
        assert!(solauto_position.position.dca.automation.target_periods == 0);
        assert!(solauto_position.position.dca.debt_to_add_base_unit == 0);

        let signer_debt_ta = data.general.unpack_account_data::<TokenAccount>(
            data.general.signer_debt_ta
        ).await;
        assert!(signer_debt_ta.amount == dca_amount);
    }

    #[tokio::test]
    async fn cancel_dca_incorrect_signer() {
        let temp_account = Keypair::new();
        let mut args = GeneralArgs::new();
        args.fund_account(temp_account.pubkey());
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

        let active_dca = DCASettingsInp {
            automation: AutomationSettingsInp {
                unix_start_date: (Utc::now().timestamp() as u64) - 1,
                interval_seconds: 60 * 60 * 24,
                periods_passed: 0,
                target_periods: 5,
            },
            debt_to_add_base_unit: dca_amount,
        };
        data.open_position(
            Some(data.general.default_setting_params.clone()),
            Some(active_dca.clone())
        ).await.unwrap();

        let tx = Transaction::new_signed_with_payer(
            &[data.general.cancel_dca_ix().signer(temp_account.pubkey()).instruction()],
            Some(&temp_account.pubkey()),
            &[&temp_account],
            data.general.ctx.last_blockhash
        );
        let err = data.general.ctx.banks_client.process_transaction(tx).await.unwrap_err();
        assert_instruction_error!(err, InstructionError::MissingRequiredSignature);
    }
}
