pub mod test_utils;

#[cfg(test)]
mod general {
    use solana_program_test::tokio;
    use solana_sdk::{
        instruction::InstructionError,
        pubkey::Pubkey,
        rent::Rent,
        signer::Signer,
        system_instruction,
        transaction::Transaction,
    };
    use spl_associated_token_account::get_associated_token_address;

    use crate::{ assert_instruction_error, test_utils::* };

    #[tokio::test]
    async fn test_solauto_position_dos_attack() {
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
            &data.general.supply_liquidity_mint.pubkey()
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
            &data.general.debt_liquidity_mint.pubkey()
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
}
