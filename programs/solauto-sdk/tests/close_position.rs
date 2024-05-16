pub mod test_utils;

#[cfg(test)]
mod update_position {
    use solana_program_test::tokio;
    use solana_sdk::{
        account::ReadableAccount, instruction::InstructionError, signature::Keypair, signer::Signer, transaction::Transaction
    };
    use spl_associated_token_account::get_associated_token_address;

    use crate::{ assert_instruction_error, test_utils::* };

    #[tokio::test]
    async fn std_close_position() {
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
        data.open_position(
            Some(data.general.default_setting_params.clone()),
            None
        ).await.unwrap();

        data.general.close_position().await.unwrap();

        // let solauto_position = data.general.ctx.banks_client.get_account(data.general.solauto_position).await.unwrap();
        // assert!(solauto_position.is_none());

        let position_supply_liquidity_ta = data.general.ctx.banks_client.get_account(data.general.position_supply_liquidity_ta).await.unwrap();
        assert!(position_supply_liquidity_ta.is_none());

        let position_debt_liquidity_ta = data.general.ctx.banks_client.get_account(data.general.position_debt_liquidity_ta.unwrap()).await.unwrap();
        assert!(position_debt_liquidity_ta.is_none());
    }
}
