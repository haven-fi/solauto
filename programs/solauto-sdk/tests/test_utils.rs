use std::str::FromStr;

use borsh::BorshDeserialize;
use solana_program_test::{ BanksClientError, ProgramTest, ProgramTestContext };
use solana_sdk::{
    compute_budget::ComputeBudgetInstruction,
    instruction::Instruction,
    program_pack::{ IsInitialized, Pack },
    pubkey::Pubkey,
    rent::Rent,
    signature::Keypair,
    signer::Signer,
    system_instruction,
    transaction::Transaction,
};
use solauto::{
    constants::{ SOLAUTO_FEES_WALLET, SOLAUTO_MANAGER },
    state::referral_state::ReferralState,
};
use solauto_sdk::{
    generated::{
        instructions::{
            CancelDCABuilder,
            ClaimReferralFeesBuilder,
            ClosePositionBuilder,
            MarginfiOpenPositionBuilder,
            UpdatePositionBuilder,
            UpdateReferralStatesBuilder,
        },
        types::{ DCASettingsInp, SolautoSettingsParametersInp, UpdatePositionData },
    },
    SOLAUTO_ID,
};
use spl_associated_token_account::{ get_associated_token_address, instruction as ata_instruction };
use spl_token::{ instruction as token_instruction, state::Mint };
use rand::{ Rng, thread_rng };

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

pub const USDC_MINT: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
pub const MARGINFI_PROGRAM: &str = "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA";

pub struct GeneralArgs {
    position_id: u8,
    supply_mint: Keypair,
    debt_mint: Keypair,
    referred_by_authority: Option<Pubkey>,
    fund_accounts: Vec<Pubkey>,
}

impl GeneralArgs {
    pub fn new() -> Self {
        Self {
            position_id: 1,
            supply_mint: Keypair::new(),
            debt_mint: Keypair::new(),
            referred_by_authority: None,
            fund_accounts: Vec::new(),
        }
    }
    pub fn position_id(&mut self, id: u8) -> &mut Self {
        self.position_id = id;
        self
    }
    pub fn supply_mint(&mut self, supply_mint: Keypair) -> &mut Self {
        self.supply_mint = supply_mint;
        self
    }
    pub fn debt_mint(&mut self, debt_mint: Keypair) -> &mut Self {
        self.debt_mint = debt_mint;
        self
    }
    pub fn referred_by_authority(&mut self, referred_by_authority: Option<Pubkey>) -> &mut Self {
        self.referred_by_authority = referred_by_authority;
        self
    }
    pub fn fund_account(&mut self, account: Pubkey) -> &mut Self {
        self.fund_accounts.push(account);
        self
    }
}

pub struct GeneralTestData<'a> {
    pub ctx: ProgramTestContext,
    pub position_id: u8,
    pub lending_protocol: Pubkey,
    pub solauto_fees_wallet: Pubkey,
    pub solauto_fees_supply_ta: Pubkey,
    pub referral_fees_dest_mint: &'a Keypair,
    pub signer_referral_state: Pubkey,
    pub signer_referral_dest_ta: Pubkey,
    pub referred_by_state: Option<Pubkey>,
    pub referred_by_authority: Option<Pubkey>,
    pub referred_by_supply_ta: Option<Pubkey>,
    pub solauto_position: Pubkey,
    pub supply_mint: &'a Keypair,
    pub position_supply_ta: Pubkey,
    pub signer_supply_ta: Pubkey,
    pub debt_mint: &'a Keypair,
    pub position_debt_ta: Pubkey,
    pub signer_debt_ta: Pubkey,

    pub default_setting_params: SolautoSettingsParametersInp,
}

impl<'a> GeneralTestData<'a> {
    pub async fn new<'b>(args: &'a GeneralArgs, lending_protocol: &'b str) -> Self {
        let lending_protocol = Pubkey::from_str(lending_protocol).unwrap();

        let mut solauto = ProgramTest::new("solauto", SOLAUTO_ID, None);
        solauto.add_program("placeholder", lending_protocol, None);

        for account in &args.fund_accounts {
            solauto.add_account(*account, solana_sdk::account::Account {
                lamports: 100_000_000_000,
                ..Default::default()
            });
        }

        let ctx = solauto.start_with_context().await;

        let solauto_fees_supply_ta = get_associated_token_address(
            &SOLAUTO_FEES_WALLET,
            &args.supply_mint.pubkey()
        );

        let signer_pubkey = ctx.payer.pubkey();
        let signer_referral_state = GeneralTestData::get_referral_state(&signer_pubkey);
        let referral_fees_dest_mint = &args.supply_mint;
        let signer_referral_dest_ta = get_associated_token_address(
            &signer_referral_state,
            &referral_fees_dest_mint.pubkey()
        );

        let (referred_by_state, referred_by_supply_ta) = if args.referred_by_authority.is_some() {
            let referred_by_state = GeneralTestData::get_referral_state(
                args.referred_by_authority.as_ref().unwrap()
            );
            let referred_by_supply_ta = get_associated_token_address(
                &referred_by_state,
                &args.supply_mint.pubkey()
            );
            (Some(referred_by_state), Some(referred_by_supply_ta))
        } else {
            (None, None)
        };

        let (solauto_position, _) = Pubkey::find_program_address(
            &[&[args.position_id], signer_pubkey.as_ref()],
            &SOLAUTO_ID
        );
        let position_supply_ta = get_associated_token_address(
            &solauto_position,
            &args.supply_mint.pubkey()
        );
        let signer_supply_ta = get_associated_token_address(
            &signer_pubkey,
            &args.supply_mint.pubkey()
        );

        let signer_debt_ta = get_associated_token_address(&signer_pubkey, &args.debt_mint.pubkey());
        let position_debt_ta = get_associated_token_address(
            &solauto_position,
            &args.debt_mint.pubkey()
        );

        Self {
            ctx,
            position_id: args.position_id,
            lending_protocol,
            solauto_fees_wallet: SOLAUTO_FEES_WALLET,
            solauto_fees_supply_ta,
            referral_fees_dest_mint,
            signer_referral_state,
            signer_referral_dest_ta,
            referred_by_state,
            referred_by_authority: args.referred_by_authority.clone(),
            referred_by_supply_ta,
            solauto_position,
            supply_mint: &args.supply_mint,
            position_supply_ta,
            signer_supply_ta,
            debt_mint: &args.debt_mint,
            position_debt_ta,
            signer_debt_ta,

            default_setting_params: SolautoSettingsParametersInp {
                boost_to_bps: 5000,
                boost_gap: 500,
                repay_to_bps: 7500,
                repay_gap: 500,
                automation: None,
                target_boost_to_bps: None,
            },
        }
    }

    pub fn get_referral_state(authority: &Pubkey) -> Pubkey {
        let seeds = ReferralState::seeds(authority);
        let (referral_state, _) = Pubkey::find_program_address(&seeds, &SOLAUTO_ID);
        referral_state
    }

    pub async fn deserialize_account_data<T: BorshDeserialize>(&mut self, pubkey: Pubkey) -> T {
        let account = self.ctx.banks_client.get_account(pubkey).await.unwrap();
        assert!(account.is_some());
        T::deserialize(&mut account.unwrap().data.as_slice()).unwrap()
    }

    pub async fn unpack_account_data<T: Pack + IsInitialized>(&mut self, pubkey: Pubkey) -> T {
        let account = self.ctx.banks_client.get_account(pubkey).await.unwrap();
        assert!(account.is_some());
        T::unpack(&mut account.unwrap().data.as_slice()).unwrap()
    }

    pub async fn execute_instructions(
        &mut self,
        mut instructions: Vec<Instruction>,
        additional_signers: Option<&[&Keypair]>
    ) -> Result<(), BanksClientError> {
        instructions.insert(0, ComputeBudgetInstruction::set_compute_unit_limit(500_000));

        let mut signers = Vec::new();
        signers.push(&self.ctx.payer);

        if additional_signers.is_some() {
            for signer in additional_signers.unwrap() {
                signers.push(*signer);
            }
        }

        let tx = Transaction::new_signed_with_payer(
            instructions.as_slice(),
            Some(&self.ctx.payer.pubkey()),
            signers.as_slice(),
            self.ctx.last_blockhash
        );
        self.ctx.banks_client.process_transaction(tx).await
    }

    pub async fn test_prefixtures(&mut self) -> Result<&mut Self, BanksClientError> {
        self.create_token_mint_account(self.supply_mint).await.unwrap();
        self.create_token_mint_account(self.debt_mint).await.unwrap();
        self.create_ata(self.ctx.payer.pubkey(), self.supply_mint).await.unwrap();
        self.create_ata(self.ctx.payer.pubkey(), self.debt_mint).await.unwrap();
        self.create_ata(SOLAUTO_FEES_WALLET, self.supply_mint).await.unwrap();
        Ok(self)
    }

    pub async fn create_token_mint_account<'b>(
        &mut self,
        token_mint: &Keypair
    ) -> Result<&mut Self, BanksClientError> {
        let rent = Rent::default();
        self.execute_instructions(
            vec![
                system_instruction::create_account(
                    &self.ctx.payer.pubkey(),
                    &token_mint.pubkey(),
                    rent.minimum_balance(Mint::LEN),
                    Mint::LEN as u64,
                    &spl_token::id()
                ),
                token_instruction
                    ::initialize_mint(
                        &spl_token::id(),
                        &token_mint.pubkey(),
                        &self.ctx.payer.pubkey(),
                        None,
                        6
                    )
                    .unwrap()
            ],
            Some(&[token_mint])
        ).await.unwrap();
        Ok(self)
    }

    pub async fn create_ata(
        &mut self,
        wallet: Pubkey,
        token_mint: &Keypair
    ) -> Result<&mut Self, BanksClientError> {
        self.execute_instructions(
            vec![
                ata_instruction::create_associated_token_account(
                    &self.ctx.payer.pubkey(),
                    &wallet,
                    &token_mint.pubkey(),
                    &spl_token::id()
                )
            ],
            None
        ).await.unwrap();
        Ok(self)
    }

    pub async fn mint_tokens_to_ta(
        &mut self,
        token_mint: &Keypair,
        token_account: Pubkey,
        amount: u64
    ) -> Result<&mut Self, BanksClientError> {
        self.execute_instructions(
            vec![
                token_instruction
                    ::mint_to(
                        &spl_token::id(),
                        &token_mint.pubkey(),
                        &token_account,
                        &self.ctx.payer.pubkey(),
                        &[&self.ctx.payer.pubkey()],
                        amount
                    )
                    .unwrap()
            ],
            None
        ).await.unwrap();
        Ok(self)
    }

    pub async fn create_referral_state_accounts(&mut self) -> Result<&mut Self, BanksClientError> {
        self.execute_instructions(
            vec![self.update_referral_states_ix().instruction()],
            None
        ).await.unwrap();
        Ok(self)
    }

    pub fn update_referral_states_ix(&self) -> UpdateReferralStatesBuilder {
        let mut builder = UpdateReferralStatesBuilder::new();
        builder
            .signer(self.ctx.payer.pubkey())
            .signer_referral_state(self.signer_referral_state)
            .referral_fees_dest_mint(self.referral_fees_dest_mint.pubkey())
            .referred_by_state(self.referred_by_state)
            .referred_by_authority(self.referred_by_authority);
        builder
    }

    pub async fn claim_referral_fees(&mut self) -> Result<&mut Self, BanksClientError> {
        self.execute_instructions(
            vec![self.claim_referral_fees_ix().instruction()],
            None
        ).await.unwrap();
        Ok(self)
    }

    pub fn claim_referral_fees_ix(&self) -> ClaimReferralFeesBuilder {
        let mut builder = ClaimReferralFeesBuilder::new();
        builder
            .signer(self.ctx.payer.pubkey())
            .referral_state(self.signer_referral_state)
            .referral_fees_dest_ta(self.signer_referral_dest_ta)
            .referral_fees_dest_mint(self.referral_fees_dest_mint.pubkey())
            .fees_destination_ta(
                Some(
                    get_associated_token_address(
                        &self.ctx.payer.pubkey(),
                        &self.referral_fees_dest_mint.pubkey()
                    )
                )
            );
        builder
    }

    pub async fn update_position(
        &mut self,
        settings: Option<SolautoSettingsParametersInp>,
        dca: Option<DCASettingsInp>
    ) -> Result<&mut Self, BanksClientError> {
        self.execute_instructions(
            vec![self.update_position_ix(settings, dca).instruction()],
            None
        ).await.unwrap();
        Ok(self)
    }

    pub fn update_position_ix(
        &self,
        setting_params: Option<SolautoSettingsParametersInp>,
        dca: Option<DCASettingsInp>
    ) -> UpdatePositionBuilder {
        let mut builder = UpdatePositionBuilder::new();
        let position_data = UpdatePositionData {
            position_id: self.position_id,
            setting_params,
            dca,
        };
        builder
            .signer(self.ctx.payer.pubkey())
            .solauto_position(self.solauto_position)
            .debt_mint(Some(self.debt_mint.pubkey()))
            .position_debt_ta(Some(self.position_debt_ta))
            .signer_debt_ta(Some(self.signer_debt_ta))
            .update_position_data(position_data);
        builder
    }

    pub async fn close_position(&mut self) -> Result<&mut Self, BanksClientError> {
        self.execute_instructions(
            vec![self.close_position_ix().instruction()],
            None
        ).await.unwrap();
        Ok(self)
    }

    pub fn close_position_ix(&self) -> ClosePositionBuilder {
        let mut builder = ClosePositionBuilder::new();
        builder
            .signer(self.ctx.payer.pubkey())
            .solauto_position(self.solauto_position)
            .position_supply_ta(self.position_supply_ta)
            .signer_supply_ta(self.signer_supply_ta)
            .position_debt_ta(self.position_debt_ta)
            .signer_debt_ta(self.signer_debt_ta)
            .protocol_account(self.solauto_position);
        builder
    }

    pub fn cancel_dca_ix(&self) -> CancelDCABuilder {
        let mut builder = CancelDCABuilder::new();
        builder
            .signer(self.ctx.payer.pubkey())
            .solauto_position(self.solauto_position)
            .debt_mint(Some(self.debt_mint.pubkey()))
            .position_debt_ta(Some(self.position_debt_ta))
            .signer_debt_ta(Some(self.signer_debt_ta));
        builder
    }
}

pub struct MarginfiTestData<'a> {
    pub general: GeneralTestData<'a>,
    pub marginfi_account: Pubkey,
    pub marginfi_account_keypair: Option<Keypair>,
    pub marginfi_account_seed_idx: Option<u64>,
    pub marginfi_group: Pubkey,
}

impl<'a> MarginfiTestData<'a> {
    pub async fn new(args: &'a GeneralArgs) -> Self {
        let general = GeneralTestData::new(args, MARGINFI_PROGRAM).await;
        let marginfi_group = Keypair::new().pubkey();

        let marginfi_account_seed_idx = if args.position_id != 0 {
            let mut rng = thread_rng();
            let random_number: u64 = rng.gen();
            Some(random_number)
        } else {
            None
        };
        let (marginfi_account, marginfi_account_keypair) = if args.position_id != 0 {
            let seed_idx = marginfi_account_seed_idx.unwrap().to_le_bytes();
            let marginfi_account_seeds = &[general.solauto_position.as_ref(), seed_idx.as_ref()];
            let (marginfi_account, _) = Pubkey::find_program_address(
                marginfi_account_seeds.as_slice(),
                &SOLAUTO_ID
            );
            (marginfi_account, None)
        } else {
            let keypair = Keypair::new();
            (keypair.pubkey(), Some(keypair))
        };

        Self {
            general,
            marginfi_account,
            marginfi_account_keypair,
            marginfi_account_seed_idx,
            marginfi_group,
        }
    }

    pub async fn test_prefixtures(&mut self) -> Result<&mut Self, BanksClientError> {
        self.general.test_prefixtures().await?;
        Ok(self)
    }

    pub async fn open_position(
        &mut self,
        settings: Option<SolautoSettingsParametersInp>,
        dca: Option<DCASettingsInp>
    ) -> Result<&mut Self, BanksClientError> {
        let mut additional_signers = vec![];
        if self.general.position_id == 0 {
            additional_signers.push(self.marginfi_account_keypair.as_ref().unwrap());
        }
        self.general
            .execute_instructions(
                vec![self.open_position_ix(settings, dca).instruction()],
                Some(additional_signers.as_slice())
            ).await
            .unwrap();
        Ok(self)
    }

    pub fn open_position_ix(
        &self,
        setting_params: Option<SolautoSettingsParametersInp>,
        dca: Option<DCASettingsInp>
    ) -> MarginfiOpenPositionBuilder {
        let mut builder = MarginfiOpenPositionBuilder::new();
        let position_data = UpdatePositionData {
            position_id: self.general.position_id,
            setting_params,
            dca,
        };
        builder
            .signer(self.general.ctx.payer.pubkey())
            .marginfi_program(self.general.lending_protocol)
            .solauto_manager(SOLAUTO_MANAGER)
            .solauto_fees_wallet(self.general.solauto_fees_wallet)
            .solauto_fees_supply_ta(self.general.solauto_fees_supply_ta)
            .signer_referral_state(self.general.signer_referral_state)
            .referred_by_state(self.general.referred_by_state)
            .referred_by_supply_ta(self.general.referred_by_supply_ta)
            .solauto_position(self.general.solauto_position)
            .marginfi_group(self.marginfi_group)
            .marginfi_account(self.marginfi_account, self.general.position_id == 0)
            .supply_mint(self.general.supply_mint.pubkey())
            .supply_bank(Pubkey::default())
            .position_supply_ta(self.general.position_supply_ta)
            .debt_mint(self.general.debt_mint.pubkey())
            .debt_bank(Pubkey::default())
            .signer_debt_ta(Some(self.general.signer_debt_ta))
            .position_debt_ta(self.general.position_debt_ta)
            .position_data(position_data);
        if self.marginfi_account_seed_idx.is_some() {
            builder.marginfi_account_seed_idx(self.marginfi_account_seed_idx.unwrap());
        }
        builder
    }
}
