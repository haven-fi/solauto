use std::str::FromStr;

use borsh::BorshDeserialize;
use solana_program_test::{ ProgramTest, ProgramTestContext };
use solana_sdk::{ pubkey::Pubkey, signature::Keypair, signer::Signer };
use solauto_sdk::{ generated::instructions::UpdateReferralStatesBuilder, SOLAUTO_ID };
use spl_associated_token_account::get_associated_token_address;

#[macro_export]
macro_rules! assert_instruction_error {
    ($error:expr, $matcher:pat) => {
        match $error {
            solana_program_test::BanksClientError::TransactionError(
                solana_sdk::transaction::TransactionError::InstructionError(_, $matcher)
            ) => {
                assert!(true);
            },
            err => assert!(false, "Expected instruction error but got '{:#?}'", err),
        }
    };
}

pub const WSOL_MINT: &str = "So11111111111111111111111111111111111111112";
pub const USDC_MINT: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
pub const MARGINFI_PROGRAM: &str = "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA";

pub struct GeneralArgs {
    signer: Option<Pubkey>,
    position_id: u8,
    supply_mint: Pubkey,
    debt_mint: Pubkey,
    referred_by_authority: Option<Pubkey>,
    referral_fees_dest_mint: Pubkey,
    fund_accounts: Vec<Pubkey>,
}

impl GeneralArgs {
    pub fn new() -> Self {
        Self {
            signer: None,
            position_id: 1,
            supply_mint: Pubkey::from_str(WSOL_MINT).unwrap(),
            debt_mint: Pubkey::from_str(USDC_MINT).unwrap(),
            referred_by_authority: None,
            referral_fees_dest_mint: Pubkey::from_str(WSOL_MINT).unwrap(),
            fund_accounts: Vec::new(),
        }
    }
    pub fn signer(&mut self, signer: Pubkey) -> &mut Self {
        self.signer = Some(signer);
        self
    }
    pub fn position_id(&mut self, id: u8) -> &mut Self {
        self.position_id = id;
        self
    }
    pub fn supply_mint(&mut self, supply_mint: Pubkey) -> &mut Self {
        self.supply_mint = supply_mint;
        self
    }
    pub fn debt_mint(&mut self, debt_mint: Pubkey) -> &mut Self {
        self.debt_mint = debt_mint;
        self
    }
    pub fn referred_by_authority(&mut self, referred_by_authority: Option<Pubkey>) -> &mut Self {
        self.referred_by_authority = referred_by_authority;
        self
    }
    pub fn referral_fees_dest_mint(&mut self, referral_fees_dest_mint: Pubkey) -> &mut Self {
        self.referral_fees_dest_mint = referral_fees_dest_mint;
        self
    }
    pub fn fund_account(&mut self, account: Pubkey) -> &mut Self {
        self.fund_accounts.push(account);
        self
    }
}

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
    pub async fn new(args: &GeneralArgs, lending_protocol: &str) -> Self {
        let lending_protocol = Pubkey::from_str(lending_protocol).unwrap();

        let mut solauto = ProgramTest::new("solauto", SOLAUTO_ID, None);
        solauto.add_program("placeholder", lending_protocol, None);

        for account in &args.fund_accounts {
            solauto.add_account(*account, solana_sdk::account::Account {
                lamports: 100_000_000_000,
                ..Default::default()
            });
        }

        if args.signer.is_some() {
            solauto.add_account(*args.signer.as_ref().unwrap(), solana_sdk::account::Account {
                lamports: 100_000_000_000,
                ..Default::default()
            });
        }

        let ctx = solauto.start_with_context().await;

        let solauto_fees_wallet = Keypair::new().pubkey();
        let solauto_fees_supply_ta = get_associated_token_address(
            &solauto_fees_wallet,
            &args.supply_mint
        );

        let signer = if args.signer.is_some() {
            args.signer.unwrap()
        } else {
            ctx.payer.pubkey()
        };
        let signer_referral_state = GeneralTestData::get_referral_state(&signer);
        let signer_referral_dest_ta = get_associated_token_address(
            &signer_referral_state,
            &args.referral_fees_dest_mint
        );

        let (referred_by_state, referred_by_supply_ta) = if args.referred_by_authority.is_some() {
            let referred_by_state = GeneralTestData::get_referral_state(
                args.referred_by_authority.as_ref().unwrap()
            );
            let referred_by_supply_ta = get_associated_token_address(
                &referred_by_state,
                &args.supply_mint
            );
            (Some(referred_by_state), Some(referred_by_supply_ta))
        } else {
            (None, None)
        };

        let (solauto_position, _) = Pubkey::find_program_address(
            &[&[args.position_id], signer.as_ref()],
            &SOLAUTO_ID
        );
        let position_supply_liquidity_ta = get_associated_token_address(
            &solauto_position,
            &args.supply_mint
        );
        let signer_debt_liquidity_ta = get_associated_token_address(&signer, &args.debt_mint);
        let position_debt_liquidity_ta = get_associated_token_address(
            &solauto_position,
            &args.debt_mint
        );

        Self {
            ctx,
            lending_protocol,
            solauto_fees_wallet,
            solauto_fees_supply_ta,
            referral_fees_dest_mint: args.referral_fees_dest_mint,
            signer_referral_state,
            signer_referral_dest_ta,
            referred_by_state,
            referred_by_authority: args.referred_by_authority.clone(),
            referred_by_supply_ta,
            solauto_position,
            position_supply_liquidity_ta,
            supply_liquidity_mint: args.supply_mint.clone(),
            signer_debt_liquidity_ta,
            position_debt_liquidity_ta,
            debt_liquidity_mint: args.debt_mint.clone(),
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

pub struct MarginfiTestData {
    pub general: GeneralTestData,
    pub marginfi_group: Option<Pubkey>,
    pub marginfi_account: Option<Pubkey>,
}

impl MarginfiTestData {
    pub async fn new(args: &GeneralArgs) -> Self {
        let general = GeneralTestData::new(args, MARGINFI_PROGRAM).await;
        let marginfi_group = Keypair::new().pubkey();
        let marginfi_account = Keypair::new().pubkey();

        Self {
            general,
            marginfi_account: Some(marginfi_account),
            marginfi_group: Some(marginfi_group),
        }
    }
}
