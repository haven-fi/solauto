use std::str::FromStr;

use solana_sdk::{
    account_info::AccountInfo, entrypoint::ProgramResult, pubkey::Pubkey, signature::Keypair,
    signer::Signer,
};
use solauto_sdk::SOLAUTO_ID;
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

pub fn empty_instruction_processor(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    _data: &[u8],
) -> ProgramResult {
    Ok(())
}

pub const WSOL_MINT: &str = "So11111111111111111111111111111111111111112";
pub const USDC_MINT: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
pub const MARGINFI_PROGRAM: &str = "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA";

pub struct StandardAccounts {
    pub signer: Keypair,
    pub program: Pubkey,
    pub solauto_fees_wallet: Pubkey,
    pub solauto_fees_supply_ta: Pubkey,
    pub signer_referral_state: Pubkey,
    pub dest_referral_fees_mint: Pubkey,
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

impl StandardAccounts {
    pub fn get(
        program: &str,
        position_id: u8,
        supply_liquidity_mint: &Pubkey,
        debt_liquidity_mint: &Pubkey,
        referred_by_authority: &Option<Pubkey>,
    ) -> Self {
        let signer = Keypair::new();
        let program = Pubkey::from_str(program).expect("Should work");
        let solauto_fees_wallet = Keypair::new().pubkey();
        let solauto_fees_supply_ta =
            get_associated_token_address(&solauto_fees_wallet, &supply_liquidity_mint);

        let signer_pubkey = signer.pubkey();
        let signer_referral_state_seeds = &[signer_pubkey.as_ref(), b"referrals"];
        let (signer_referral_state, _) =
            Pubkey::find_program_address(signer_referral_state_seeds, &SOLAUTO_ID);
        let dest_referral_fees_mint = Pubkey::from_str(WSOL_MINT).expect("Should work");
        let signer_referral_dest_ta =
            get_associated_token_address(&signer_referral_state, &dest_referral_fees_mint);

        let (referred_by_state, referred_by_dest_ta, referred_by_supply_ta) =
            if referred_by_authority.is_some() {
                let referred_by_state_seeds = &[
                    referred_by_authority.as_ref().unwrap().as_ref(),
                    b"referrals",
                ];
                let (referred_by_state, _) =
                    Pubkey::find_program_address(referred_by_state_seeds, &SOLAUTO_ID);
                let referred_by_dest_ta =
                    get_associated_token_address(&referred_by_state, &dest_referral_fees_mint);
                let referred_by_supply_ta =
                    get_associated_token_address(&referred_by_state, supply_liquidity_mint);
                (
                    Some(referred_by_state),
                    Some(referred_by_dest_ta),
                    Some(referred_by_supply_ta),
                )
            } else {
                (None, None, None)
            };

        let (solauto_position, _) =
            Pubkey::find_program_address(&[&[position_id], signer.pubkey().as_ref()], &SOLAUTO_ID);
        let position_supply_liquidity_ta =
            get_associated_token_address(&solauto_position, supply_liquidity_mint);
        let signer_debt_liquidity_ta =
            get_associated_token_address(&signer.pubkey(), debt_liquidity_mint);
        let position_debt_liquidity_ta =
            get_associated_token_address(&solauto_position, debt_liquidity_mint);

        Self {
            signer,
            program,
            solauto_fees_wallet,
            solauto_fees_supply_ta,
            signer_referral_state,
            dest_referral_fees_mint,
            signer_referral_dest_ta,
            referred_by_state,
            referred_by_authority: referred_by_authority.clone(),
            referred_by_dest_ta,
            referred_by_supply_ta,
            solauto_position,
            position_supply_liquidity_ta,
            supply_liquidity_mint: supply_liquidity_mint.clone(),
            signer_debt_liquidity_ta,
            position_debt_liquidity_ta,
            debt_liquidity_mint: debt_liquidity_mint.clone(),
        }
    }
}

pub struct MarginfiAccounts {
    pub standard: StandardAccounts,
    pub marginfi_group: Pubkey,
    pub marginfi_account: Pubkey,
}

impl MarginfiAccounts {
    pub fn get(
        position_id: u8,
        supply_mint: &Pubkey,
        debt_mint: &Pubkey,
        referred_by_authority: &Option<Pubkey>,
    ) -> Self {
        let standard = StandardAccounts::get(
            MARGINFI_PROGRAM,
            position_id,
            supply_mint,
            debt_mint,
            referred_by_authority,
        );
        let marginfi_group = Keypair::new().pubkey();
        let marginfi_account = Keypair::new().pubkey();

        Self {
            standard,
            marginfi_account,
            marginfi_group,
        }
    }
}
