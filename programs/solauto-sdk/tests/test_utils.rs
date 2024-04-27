use std::str::FromStr;

use solana_program_test::{ ProgramTest, ProgramTestContext };
use solana_sdk::{ pubkey::Pubkey, signature::Keypair, signer::Signer };
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

pub struct GeneralTestAccounts {
    pub lending_protocol: Pubkey,
    pub solauto_fees_wallet: Pubkey,
    pub solauto_fees_supply_ta: Pubkey,
    pub dest_referral_fees_mint: Pubkey,
    pub signer_referral_state: Pubkey,
    pub signer_referral_dest_ta: Pubkey,
    pub referred_by_state: Option<Pubkey>,
    pub referred_by_authority: Option<Pubkey>,
    pub referred_by_dest_ta: Option<Pubkey>,
    pub referred_by_supply_ta: Option<Pubkey>,
    pub solauto_position: Pubkey,
    pub position_debt_liquidity_ta: Pubkey,
    pub debt_liquidity_mint: Pubkey,
    pub signer_debt_liquidity_ta: Pubkey,
    pub position_supply_liquidity_ta: Pubkey,
    pub supply_liquidity_mint: Pubkey,
}

pub struct GeneralTestData {
    pub ctx: ProgramTestContext,
    pub accounts: GeneralTestAccounts,
}

impl GeneralTestData {
    pub async fn new(
        lending_protocol: &str,
        pos_id: Option<u8>,
        supply_mint: Option<&Pubkey>,
        debt_mint: Option<&Pubkey>,
        referred_by_authority: Option<&Pubkey>
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

        let dest_referral_fees_mint = wsol_mint.clone();

        let signer_pubkey = ctx.payer.pubkey();
        let signer_referral_state_seeds = &[signer_pubkey.as_ref(), b"referral_state"];
        let (signer_referral_state, _) = Pubkey::find_program_address(
            signer_referral_state_seeds,
            &SOLAUTO_ID
        );
        let signer_referral_dest_ta = get_associated_token_address(
            &signer_referral_state,
            &dest_referral_fees_mint
        );

        let (referred_by_state, referred_by_dest_ta, referred_by_supply_ta) = if
            referred_by_authority.is_some()
        {
            let referred_by_state_seeds = &[
                referred_by_authority.as_ref().unwrap().as_ref(),
                b"referral_state",
            ];
            let (referred_by_state, _) = Pubkey::find_program_address(
                referred_by_state_seeds,
                &SOLAUTO_ID
            );
            let referred_by_dest_ta = get_associated_token_address(
                &referred_by_state,
                &dest_referral_fees_mint
            );
            let referred_by_supply_ta = get_associated_token_address(
                &referred_by_state,
                supply_liquidity_mint
            );
            (Some(referred_by_state), Some(referred_by_dest_ta), Some(referred_by_supply_ta))
        } else {
            (None, None, None)
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
            accounts: GeneralTestAccounts {
                lending_protocol,
                solauto_fees_wallet,
                solauto_fees_supply_ta,
                dest_referral_fees_mint,
                signer_referral_state,
                signer_referral_dest_ta,
                referred_by_state,
                referred_by_authority: referred_by_authority.copied(),
                referred_by_dest_ta,
                referred_by_supply_ta,
                solauto_position,
                position_supply_liquidity_ta,
                supply_liquidity_mint: supply_liquidity_mint.clone(),
                signer_debt_liquidity_ta,
                position_debt_liquidity_ta,
                debt_liquidity_mint: debt_liquidity_mint.clone(),
            },
        }
    }

    pub fn update_referral_states(&self) -> UpdateReferralStatesBuilder {
        let mut builder = UpdateReferralStatesBuilder::new();
        
        builder
            .signer(self.ctx.payer.pubkey())
            .dest_referral_fees_mint(self.accounts.dest_referral_fees_mint)
            .signer_referral_state(self.accounts.signer_referral_state)
            .signer_referral_dest_ta(self.accounts.signer_referral_dest_ta)
            .referred_by_state(self.accounts.referred_by_state)
            .referred_by_authority(self.accounts.referred_by_authority)
            .referred_by_dest_ta(self.accounts.referred_by_dest_ta);

        builder
    }
}

pub struct MarginfiTestAccounts {
    pub marginfi_group: Option<Pubkey>,
    pub marginfi_account: Option<Pubkey>,
}

pub struct MarginfiTestData {
    pub general: GeneralTestData,
    pub accounts: MarginfiTestAccounts,
}

impl MarginfiTestData {
    pub async fn new(
        position_id: Option<u8>,
        supply_mint: Option<&Pubkey>,
        debt_mint: Option<&Pubkey>,
        referred_by_authority: Option<&Pubkey>
    ) -> Self {
        let general = GeneralTestData::new(
            MARGINFI_PROGRAM,
            position_id,
            supply_mint,
            debt_mint,
            referred_by_authority
        ).await;
        let marginfi_group = Keypair::new().pubkey();
        let marginfi_account = Keypair::new().pubkey();

        Self {
            general,
            accounts: MarginfiTestAccounts {
                marginfi_account: Some(marginfi_account),
                marginfi_group: Some(marginfi_group),
            },
        }
    }
}
