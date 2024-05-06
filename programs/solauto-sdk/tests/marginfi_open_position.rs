pub mod test_utils;

#[cfg(test)]
mod open_position {
    use solana_program_test::tokio;
    use solana_sdk::{ signature::Signer, transaction::Transaction };
    use solauto_sdk::generated::{ accounts::PositionAccount, types::{LendingPlatform, SolautoSettingsParameters} };

    use crate::test_utils::*;

    #[tokio::test]
    async fn standard_open_position() {
        let args = GeneralArgs::new();
        let mut data = MarginfiTestData::new(&args).await;
        data.general.test_prefixtures().await.unwrap();

        let setting_params = SolautoSettingsParameters {
            repay_from_bps: 95,
            repay_to_bps: 90,
            boost_from_bps: 45,
            boost_to_bps: 50,
        };
        let tx = Transaction::new_signed_with_payer(
            &[
                data.general.update_referral_states().instruction(),
                data.open_position(Some(setting_params.clone()), None).instruction(),
            ],
            Some(&data.general.ctx.payer.pubkey()),
            &[&data.general.ctx.payer],
            data.general.ctx.last_blockhash
        );
        data.general.ctx.banks_client.process_transaction(tx).await.unwrap();

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
        assert!(position.protocol_data.debt_mint == data.general.debt_liquidity_mint.map_or_else(|| None, |mint| Some(mint.pubkey())));
        assert!(position.protocol_data.protocol_account == data.marginfi_account);
    }
}
