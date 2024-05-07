pub mod test_utils;

#[cfg(test)]
mod open_position {
    use chrono::Utc;
    use solana_program_test::tokio;
    use solana_sdk::signature::Signer;
    use solauto_sdk::generated::{
        accounts::PositionAccount,
        types::{ DCADirection, DCASettings, LendingPlatform, SolautoSettingsParameters },
    };
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

        let solauto_position = data.general.deserialize_account_data::<PositionAccount>(
            data.general.solauto_position
        ).await;

        assert!(solauto_position.self_managed == false);
        assert!(solauto_position.position_id == data.general.position_id);
        assert!(solauto_position.authority == data.general.ctx.payer.pubkey());

        let position = solauto_position.position.as_ref().unwrap();
        assert!(position.setting_params == setting_params);
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
    async fn std_update_position_with_dca() {
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
        data.open_position(None, Some(active_dca.clone())).await.unwrap();

        let position_account = data.general.deserialize_account_data::<PositionAccount>(
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
}
