pub mod test_utils;

#[cfg(test)]
mod open_position {
    use solana_program_test::tokio;
    use solana_sdk::{ instruction::InstructionError, signature::Signer, transaction::Transaction };
    use solauto_sdk::generated::{
        accounts::PositionAccount,
        types::{ LendingPlatform, SolautoSettingsParameters },
    };

    use crate::{ assert_instruction_error, test_utils::* };

    #[tokio::test]
    async fn standard_open_position() {
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

        let solauto_position = data.general.get_account_data::<PositionAccount>(
            data.general.solauto_position
        ).await;

        assert!(solauto_position.self_managed == false);
        assert!(solauto_position.position_id == data.general.position_id);
        assert!(solauto_position.authority == data.general.ctx.payer.pubkey());

        let position = solauto_position.position.as_ref().unwrap();
        assert!(position.setting_params == setting_params);
        assert!(position.active_dca == None);
        assert!(position.lending_platform == LendingPlatform::Marginfi);
        assert!(position.protocol_data.supply_mint == data.general.supply_liquidity_mint);
        assert!(
            position.protocol_data.debt_mint ==
                data.general.debt_liquidity_mint.map_or_else(
                    || None,
                    |mint| Some(mint.pubkey())
                )
        );
        assert!(position.protocol_data.protocol_account == data.marginfi_account);
    }

    // pub async fn test_invalid_settings<'a, 'b>(
    //     data: &'b mut MarginfiTestData<'a>,
    //     settings: SolautoSettingsParameters
    // ) {
    //     let tx = Transaction::new_signed_with_payer(
    //         &[data.open_position(Some(settings.clone()), None).instruction()],
    //         Some(&data.general.ctx.payer.pubkey()),
    //         &[&data.general.ctx.payer],
    //         data.general.ctx.last_blockhash
    //     );
    //     let err = data.general.ctx.banks_client.process_transaction(tx).await.unwrap_err();
    //     assert_instruction_error!(err, InstructionError::Custom(4));
    // }

    // #[tokio::test]
    // async fn invalid_setting_params() {
    //     let args = GeneralArgs::new();
    //     let mut data = MarginfiTestData::new(&args).await;
    //     data.general
    //         .test_prefixtures().await
    //         .unwrap()
    //         .create_referral_state_accounts().await
    //         .unwrap();

    //     test_invalid_settings(&mut data, SolautoSettingsParameters {
    //         repay_from_bps: 1001,
    //         repay_to_bps: 9000,
    //         boost_from_bps: 4500,
    //         boost_to_bps: 5000,
    //     }).await;
    // }
}
