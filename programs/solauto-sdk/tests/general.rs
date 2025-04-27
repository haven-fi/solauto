pub mod test_utils;

#[cfg(test)]
mod general {
    use chrono::Utc;
    use solana_program_test::tokio;
    use solana_sdk::{
        instruction::InstructionError,
        program_pack::Pack,
        rent::Rent,
        signature::Keypair,
        signer::Signer,
        system_instruction,
        transaction::Transaction,
    };
    use solauto_sdk::generated::{
        accounts::SolautoPosition,
        types::{ AutomationSettingsInp, DCASettingsInp, TokenType },
    };
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

        data.open_position(Some(data.general.default_settings.clone()), None).await.unwrap();
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

        data.open_position(Some(data.general.default_settings.clone()), None).await.unwrap();

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

        data.open_position(Some(data.general.default_settings.clone()), None).await.unwrap();
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
                        .open_position_ix(Some(data.general.default_settings.clone()), None)
                        // Pass incorrect solauto position for the given signer
                        .solauto_position(solauto_position)
                        .instruction(),
                ],
                None
            ).await
            .unwrap_err();

        assert_instruction_error!(err, InstructionError::MissingRequiredSignature);
    }
}
