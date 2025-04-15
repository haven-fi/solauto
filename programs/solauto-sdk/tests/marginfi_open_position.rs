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
        types::{
            AutomationSettingsInp,
            DCASettingsInp,
            LendingPlatform,
            SolautoSettingsParametersInp, TokenType,
        },
    };
    use spl_associated_token_account::get_associated_token_address;
    use spl_token::state::Account as TokenAccount;

    use crate::{ assert_instruction_error, test_utils::* };

    #[tokio::test]
    async fn std_open_position() {
        let args = GeneralArgs::new();
        let mut data = MarginfiTestData::new(&args).await;
        data.test_prefixtures().await
            .unwrap()
            .general.create_referral_state_accounts().await
            .unwrap();

        let settings = SolautoSettingsParametersInp {
            boost_to_bps: 5000,
            boost_gap: 500,
            repay_to_bps: 7500,
            repay_gap: 500,
        };
        data.open_position(Some(settings.clone()), None).await.unwrap();

        let solauto_position = data.general.deserialize_account_data::<SolautoPosition>(
            data.general.solauto_position
        ).await;

        assert!(solauto_position.position_id[0] == data.general.position_id);
        assert!(solauto_position.authority == data.general.ctx.payer.pubkey());

        let position = &solauto_position.position;
        assert!(position.settings.boost_to_bps == settings.boost_to_bps);
        assert!(position.lending_platform == LendingPlatform::Marginfi);
        assert!(solauto_position.state.supply.mint == data.general.supply_mint.pubkey());
        assert!(solauto_position.state.debt.mint == data.general.debt_mint.pubkey());
        assert!(position.lp_user_account == data.marginfi_account);
        assert!(position.lp_pool_account == data.marginfi_group);
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

        let tx = Transaction::new_signed_with_payer(
            &[
                data
                    .open_position_ix(Some(data.general.default_settings.clone()), None)
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
        data.test_prefixtures().await
            .unwrap()
            .general.create_referral_state_accounts().await
            .unwrap();

        let mut open_position_ix = data.open_position_ix(
            Some(data.general.default_settings.clone()),
            None
        );

        // Correct mint, incorrect wallet
        let fake_supply_ta = get_associated_token_address(
            &data.general.ctx.payer.pubkey(),
            &data.general.supply_mint.pubkey()
        );
        let err = data.general
            .execute_instructions(
                vec![open_position_ix.position_supply_ta(fake_supply_ta).instruction()],
                None
            ).await
            .unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(0));

        // Correct wallet, incorrect mint
        let fake_supply_ta = get_associated_token_address(
            &data.general.solauto_position,
            &data.general.debt_mint.pubkey()
        );
        let err = data.general
            .execute_instructions(
                vec![open_position_ix.position_supply_ta(fake_supply_ta).instruction()],
                None
            ).await
            .unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(0));

        // Correct mint, incorrect wallet
        let fake_debt_ta = get_associated_token_address(
            &data.general.ctx.payer.pubkey(),
            &data.general.debt_mint.pubkey()
        );
        let err = data.general
            .execute_instructions(
                vec![open_position_ix.position_debt_ta(fake_debt_ta).instruction()],
                None
            ).await
            .unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(0));

        // Correct wallet, incorrect mint
        let fake_debt_ta = get_associated_token_address(
            &data.general.solauto_position,
            &data.general.supply_mint.pubkey()
        );
        let err = data.general
            .execute_instructions(
                vec![open_position_ix.position_debt_ta(fake_debt_ta).instruction()],
                None
            ).await
            .unwrap_err();
        assert_instruction_error!(err, InstructionError::Custom(0));
    }
}
