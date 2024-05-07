use std::str::FromStr;

use borsh::BorshDeserialize;
use solana_program_test::{ BanksClientError, ProgramTest, ProgramTestContext };
use solana_sdk::{
    program_pack::{ IsInitialized, Pack },
    pubkey::Pubkey,
    rent::Rent,
    signature::Keypair,
    signer::Signer,
    system_instruction,
    transaction::Transaction,
};
use solauto::{
    constants::{ SOLAUTO_FEES_WALLET, WSOL_MINT },
    utils::solauto_utils::get_referral_account_seeds,
};
use solauto_sdk::{
    generated::{
        instructions::{ MarginfiOpenPositionBuilder, UpdateReferralStatesBuilder },
        types::{ DCASettings, SolautoSettingsParameters, UpdatePositionData },
    },
    SOLAUTO_ID,
};
use spl_associated_token_account::{ get_associated_token_address, instruction as ata_instruction };
use spl_token::{ instruction as token_instruction, state::Mint };

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
    debt_mint: Option<Keypair>,
    referred_by_authority: Option<Pubkey>,
    referral_fees_dest_mint: Pubkey,
    fund_accounts: Vec<Pubkey>,
}

impl GeneralArgs {
    pub fn new() -> Self {
        Self {
            position_id: 1,
            supply_mint: Keypair::new(),
            debt_mint: Some(Keypair::new()),
            referred_by_authority: None,
            referral_fees_dest_mint: WSOL_MINT,
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
    pub fn debt_mint(&mut self, debt_mint: Option<Keypair>) -> &mut Self {
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

pub struct GeneralTestData<'a> {
    pub ctx: ProgramTestContext,
    pub position_id: u8,
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
    pub supply_liquidity_mint: &'a Keypair,
    pub position_supply_liquidity_ta: Pubkey,
    pub signer_supply_liquidity_ta: Pubkey,
    pub debt_liquidity_mint: Option<&'a Keypair>,
    pub position_debt_liquidity_ta: Option<Pubkey>,
    pub signer_debt_liquidity_ta: Option<Pubkey>,
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
        let position_supply_liquidity_ta = get_associated_token_address(
            &solauto_position,
            &args.supply_mint.pubkey()
        );
        let signer_supply_liquidity_ta = get_associated_token_address(
            &signer_pubkey,
            &args.supply_mint.pubkey()
        );

        let signer_debt_liquidity_ta = if args.debt_mint.is_some() {
            Some(
                get_associated_token_address(
                    &signer_pubkey,
                    &args.debt_mint.as_ref().unwrap().pubkey()
                )
            )
        } else {
            None
        };
        let position_debt_liquidity_ta = if args.debt_mint.is_some() {
            Some(
                get_associated_token_address(
                    &solauto_position,
                    &args.debt_mint.as_ref().unwrap().pubkey()
                )
            )
        } else {
            None
        };

        Self {
            ctx,
            position_id: args.position_id,
            lending_protocol,
            solauto_fees_wallet: SOLAUTO_FEES_WALLET,
            solauto_fees_supply_ta,
            referral_fees_dest_mint: args.referral_fees_dest_mint,
            signer_referral_state,
            signer_referral_dest_ta,
            referred_by_state,
            referred_by_authority: args.referred_by_authority.clone(),
            referred_by_supply_ta,
            solauto_position,
            supply_liquidity_mint: &args.supply_mint,
            position_supply_liquidity_ta,
            signer_supply_liquidity_ta,
            debt_liquidity_mint: args.debt_mint.as_ref(),
            position_debt_liquidity_ta,
            signer_debt_liquidity_ta,
        }
    }

    pub fn get_referral_state(authority: &Pubkey) -> Pubkey {
        let seeds = get_referral_account_seeds(authority);
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

    pub async fn test_prefixtures(&mut self) -> Result<&mut Self, BanksClientError> {
        self.create_token_mint_account(self.supply_liquidity_mint).await.unwrap();

        if self.debt_liquidity_mint.is_some() {
            self.create_token_mint_account(self.debt_liquidity_mint.unwrap()).await.unwrap();
        }

        Ok(self)
    }

    pub async fn create_token_mint_account<'b>(
        &mut self,
        token_mint: &Keypair
    ) -> Result<&mut Self, BanksClientError> {
        let rent = Rent::default();
        let tx = Transaction::new_signed_with_payer(
            &[
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
                    .unwrap(),
            ],
            Some(&self.ctx.payer.pubkey()),
            &[&self.ctx.payer, token_mint],
            self.ctx.last_blockhash
        );
        self.ctx.banks_client.process_transaction(tx).await.unwrap();
        Ok(self)
    }

    pub async fn create_ata(
        &mut self,
        wallet: Pubkey,
        token_mint: &Keypair
    ) -> Result<&mut Self, BanksClientError> {
        let tx = Transaction::new_signed_with_payer(
            &[
                ata_instruction::create_associated_token_account(
                    &self.ctx.payer.pubkey(),
                    &wallet,
                    &token_mint.pubkey(),
                    &spl_token::id()
                ),
            ],
            Some(&self.ctx.payer.pubkey()),
            &[&self.ctx.payer],
            self.ctx.last_blockhash
        );
        self.ctx.banks_client.process_transaction(tx).await.unwrap();
        Ok(self)
    }

    pub async fn mint_tokens_to_ta(
        &mut self,
        token_mint: &Keypair,
        token_account: Pubkey,
        ta_owner: Pubkey,
        amount: u64
    ) -> Result<&mut Self, BanksClientError> {
        let tx = Transaction::new_signed_with_payer(
            &[
                token_instruction
                    ::mint_to(
                        &spl_token::id(),
                        &token_mint.pubkey(),
                        &token_account,
                        &ta_owner,
                        &[&self.ctx.payer.pubkey()],
                        amount
                    )
                    .unwrap(),
            ],
            Some(&self.ctx.payer.pubkey()),
            &[&self.ctx.payer],
            self.ctx.last_blockhash
        );
        self.ctx.banks_client.process_transaction(tx).await.unwrap();
        Ok(self)
    }

    pub async fn create_referral_state_accounts(&mut self) -> Result<&mut Self, BanksClientError> {
        let tx = Transaction::new_signed_with_payer(
            &[self.update_referral_states_ix().instruction()],
            Some(&self.ctx.payer.pubkey()),
            &[&self.ctx.payer],
            self.ctx.last_blockhash
        );
        self.ctx.banks_client.process_transaction(tx).await.unwrap();
        Ok(self)
    }

    pub fn update_referral_states_ix(&self) -> UpdateReferralStatesBuilder {
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

pub struct MarginfiTestData<'a> {
    pub general: GeneralTestData<'a>,
    pub marginfi_account: Pubkey,
    pub marginfi_account_keypair: Option<Keypair>,
    pub marginfi_group: Pubkey,
}

impl<'a> MarginfiTestData<'a> {
    pub async fn new(args: &'a GeneralArgs) -> Self {
        let general = GeneralTestData::new(args, MARGINFI_PROGRAM).await;
        let marginfi_group = Keypair::new().pubkey();

        let (marginfi_account, keypair) = if args.position_id != 0 {
            let signer_pubkey = general.ctx.payer.pubkey();
            let marginfi_account_seeds = &[
                general.solauto_position.as_ref(),
                signer_pubkey.as_ref(),
                general.lending_protocol.as_ref(),
            ];
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
            marginfi_account: marginfi_account,
            marginfi_account_keypair: keypair,
            marginfi_group: marginfi_group,
        }
    }

    pub async fn open_position(
        &mut self,
        settings: Option<SolautoSettingsParameters>,
        active_dca: Option<DCASettings>
    ) -> Result<&mut Self, BanksClientError> {
        let setting_params = if settings.is_some() || self.general.position_id == 0 {
            settings.unwrap()
        } else {
            SolautoSettingsParameters {
                repay_from_bps: 9500,
                repay_to_bps: 9000,
                boost_from_bps: 4500,
                boost_to_bps: 5000,
            }
        };
        let mut signers = vec![&self.general.ctx.payer];
        if self.general.position_id != 0 {
            signers.push(self.marginfi_account_keypair.as_ref().unwrap());
        }
        let tx = Transaction::new_signed_with_payer(
            &[self.open_position_ix(Some(setting_params.clone()), active_dca).instruction()],
            Some(&self.general.ctx.payer.pubkey()),
            signers.as_slice(),
            self.general.ctx.last_blockhash
        );
        self.general.ctx.banks_client.process_transaction(tx).await.unwrap();
        Ok(self)
    }

    pub fn open_position_ix(
        &self,
        setting_params: Option<SolautoSettingsParameters>,
        active_dca: Option<DCASettings>
    ) -> MarginfiOpenPositionBuilder {
        let mut builder = MarginfiOpenPositionBuilder::new();
        let position_data = UpdatePositionData {
            position_id: self.general.position_id,
            setting_params,
            active_dca,
        };
        builder
            .signer(self.general.ctx.payer.pubkey())
            .marginfi_program(self.general.lending_protocol)
            .solauto_fees_wallet(self.general.solauto_fees_wallet)
            .solauto_fees_supply_ta(self.general.solauto_fees_supply_ta)
            .signer_referral_state(self.general.signer_referral_state)
            .referred_by_state(self.general.referred_by_state)
            .referred_by_supply_ta(self.general.referred_by_supply_ta)
            .solauto_position(self.general.solauto_position)
            .marginfi_group(self.marginfi_group)
            .marginfi_account(self.marginfi_account, self.general.position_id == 0)
            .position_supply_ta(self.general.position_supply_liquidity_ta)
            .supply_mint(self.general.supply_liquidity_mint.pubkey())
            .signer_debt_ta(self.general.signer_debt_liquidity_ta)
            .position_debt_ta(self.general.position_debt_liquidity_ta)
            .debt_mint(
                self.general.debt_liquidity_mint.map_or_else(
                    || None,
                    |mint| Some(mint.pubkey())
                )
            )
            .update_position_data(position_data);
        builder
    }
}
