use std::str::FromStr;

use borsh::BorshDeserialize;
use solana_program_test::{ ProgramTest, ProgramTestContext };
use solana_sdk::{ account::Account, pubkey::Pubkey, signature::Keypair, signer::Signer };
use solauto_sdk::{ generated::instructions::UpdateReferralStatesBuilder, SOLAUTO_ID };
use spl_associated_token_account::get_associated_token_address;

#[macro_export]
macro_rules! assert_instruction_error {
    ($error:expr, $matcher:pat) => {
        match $error {
            BanksClientError::TransactionError(TransactionError::InstructionError(_, $matcher)) => {
                assert!(true)
            }
            err => assert!(false, "Expected instruction error but got '{:#?}'", err),
        };
    };
}

pub const WSOL_MINT: &str = "So11111111111111111111111111111111111111112";
pub const USDC_MINT: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
pub const MARGINFI_PROGRAM: &str = "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA";

pub struct GeneralTestData {
    pub ctx: ProgramTestContext,
    pub lending_protocol: Pubkey,
    pub solauto_fees_wallet: Pubkey,
    pub solauto_fees_supply_ta: Pubkey,
    pub referral_fees_dest_mint: Pubkey,
    pub signer_referral_state: Pubkey,
    pub signer_referral_dest_ta: Pubkey,
    pub referred_by_state: Option<Pubkey>,
    pub referred_by_authority: Option<Pubkey>,
    pub referred_by_supply_ta: Option<Pubkey>,
    pub solauto_position: Pubkey,
    pub position_debt_liquidity_ta: Pubkey,
    pub debt_liquidity_mint: Pubkey,
    pub signer_debt_liquidity_ta: Pubkey,
    pub position_supply_liquidity_ta: Pubkey,
    pub supply_liquidity_mint: Pubkey,
}

impl GeneralTestData {
    pub async fn new(
        lending_protocol: &str,
        pos_id: Option<u8>,
        supply_mint: Option<&Pubkey>,
        debt_mint: Option<&Pubkey>,
        referred_by_authority: Option<&Pubkey>,
        ref_fees_dest_mint: Option<&Pubkey>
    ) -> Self {
        let wsol_mint = Pubkey::from_str(WSOL_MINT).expect("Should work");
        let usdc_mint = Pubkey::from_str(USDC_MINT).expect("Should work");

        let lending_protocol = Pubkey::from_str(lending_protocol).expect("Should work");
        let supply_liquidity_mint = if supply_mint.is_none() {
            &wsol_mint
        } else {
            supply_mint.unwrap()
        };
        let debt_liquidity_mint = if debt_mint.is_none() { &usdc_mint } else { debt_mint.unwrap() };
        let position_id = if pos_id.is_none() { 1 } else { pos_id.unwrap() };

        let mut solauto = ProgramTest::new("solauto", SOLAUTO_ID, None);
        solauto.add_program("placeholder", lending_protocol, None);
        let ctx = solauto.start_with_context().await;

        let solauto_fees_wallet = Keypair::new().pubkey();
        let solauto_fees_supply_ta = get_associated_token_address(
            &solauto_fees_wallet,
            &supply_liquidity_mint
        );

        let referral_fees_dest_mint = if ref_fees_dest_mint.is_some() {
            ref_fees_dest_mint.unwrap().clone()
        } else {
            wsol_mint.clone()
        };

        let signer_pubkey = ctx.payer.pubkey();
        // Tgodo
        let signer_referral_state = GeneralTestData::get_referral_state(&signer_pubkey);
        let signer_referral_dest_ta = get_associated_token_address(
            &signer_referral_state,
            &referral_fees_dest_mint
        );

        let (referred_by_state, referred_by_supply_ta) = if referred_by_authority.is_some() {
            let referred_by_state = GeneralTestData::get_referral_state(
                &referred_by_authority.as_ref().unwrap()
            );
            let referred_by_supply_ta = get_associated_token_address(
                &referred_by_state,
                supply_liquidity_mint
            );
            (Some(referred_by_state), Some(referred_by_supply_ta))
        } else {
            (None, None)
        };

        let (solauto_position, _) = Pubkey::find_program_address(
            &[&[position_id], ctx.payer.pubkey().as_ref()],
            &SOLAUTO_ID
        );
        let position_supply_liquidity_ta = get_associated_token_address(
            &solauto_position,
            supply_liquidity_mint
        );
        let signer_debt_liquidity_ta = get_associated_token_address(
            &ctx.payer.pubkey(),
            debt_liquidity_mint
        );
        let position_debt_liquidity_ta = get_associated_token_address(
            &solauto_position,
            debt_liquidity_mint
        );

        Self {
            ctx,
            lending_protocol,
            solauto_fees_wallet,
            solauto_fees_supply_ta,
            referral_fees_dest_mint,
            signer_referral_state,
            signer_referral_dest_ta,
            referred_by_state,
            referred_by_authority: referred_by_authority.copied(),
            referred_by_supply_ta,
            solauto_position,
            position_supply_liquidity_ta,
            supply_liquidity_mint: supply_liquidity_mint.clone(),
            signer_debt_liquidity_ta,
            position_debt_liquidity_ta,
            debt_liquidity_mint: debt_liquidity_mint.clone(),
        }
    }

    pub fn get_referral_state(authority: &Pubkey) -> Pubkey {
        let seeds = &[authority.as_ref(), b"referral_state"];
        let (referral_state, _) = Pubkey::find_program_address(seeds, &SOLAUTO_ID);
        referral_state
    }

    pub async fn get_account_data<T: BorshDeserialize>(&mut self, pubkey: Pubkey) -> T {
        let account = self.ctx.banks_client.get_account(pubkey).await.unwrap();
        assert!(account.is_some());
        T::deserialize(&mut account.unwrap().data.as_slice()).unwrap()
    }

    pub fn update_referral_states(&self) -> UpdateReferralStatesBuilder {
        let mut builder = UpdateReferralStatesBuilder::new();

        builder
            .signer(self.ctx.payer.pubkey())
            .signer_referral_state(self.signer_referral_state)
            .referred_by_state(self.referred_by_state)
            .referred_by_authority(self.referred_by_authority)
            .referral_fees_dest_mint(self.referral_fees_dest_mint);

        builder
    }
}

pub struct MarginfiTestAccounts {}

pub struct MarginfiTestData {
    pub general: GeneralTestData,
    pub marginfi_group: Option<Pubkey>,
    pub marginfi_account: Option<Pubkey>,
}

impl MarginfiTestData {
    pub async fn new(
        position_id: Option<u8>,
        supply_mint: Option<&Pubkey>,
        debt_mint: Option<&Pubkey>,
        referred_by_authority: Option<&Pubkey>,
        referral_fees_dest_mint: Option<&Pubkey>
    ) -> Self {
        let general = GeneralTestData::new(
            MARGINFI_PROGRAM,
            position_id,
            supply_mint,
            debt_mint,
            referred_by_authority,
            referral_fees_dest_mint
        ).await;
        let marginfi_group = Keypair::new().pubkey();
        let marginfi_account = Keypair::new().pubkey();

        Self {
            general,
            marginfi_account: Some(marginfi_account),
            marginfi_group: Some(marginfi_group),
        }
    }
}
