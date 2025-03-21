//! This code was AUTOGENERATED using the kinobi library.
//! Please DO NOT EDIT THIS FILE, instead use visitors
//! to add features, then rerun kinobi to update it.
//!
//! [https://github.com/metaplex-foundation/kinobi]
//!

use borsh::BorshDeserialize;
use borsh::BorshSerialize;

/// Accounts.
pub struct PhoenixSwap {
    pub swap_program: solana_program::pubkey::Pubkey,

    pub log_authority: solana_program::pubkey::Pubkey,

    pub market: solana_program::pubkey::Pubkey,

    pub trader: solana_program::pubkey::Pubkey,

    pub base_account: solana_program::pubkey::Pubkey,

    pub quote_account: solana_program::pubkey::Pubkey,

    pub base_vault: solana_program::pubkey::Pubkey,

    pub quote_vault: solana_program::pubkey::Pubkey,

    pub token_program: solana_program::pubkey::Pubkey,
}

impl PhoenixSwap {
    pub fn instruction(&self) -> solana_program::instruction::Instruction {
        self.instruction_with_remaining_accounts(&[])
    }
    #[allow(clippy::vec_init_then_push)]
    pub fn instruction_with_remaining_accounts(
        &self,
        remaining_accounts: &[solana_program::instruction::AccountMeta],
    ) -> solana_program::instruction::Instruction {
        let mut accounts = Vec::with_capacity(9 + remaining_accounts.len());
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.swap_program,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.log_authority,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.market,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.trader,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.base_account,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.quote_account,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.base_vault,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.quote_vault,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.token_program,
            false,
        ));
        accounts.extend_from_slice(remaining_accounts);
        let data = PhoenixSwapInstructionData::new().try_to_vec().unwrap();

        solana_program::instruction::Instruction {
            program_id: crate::JUPITER_ID,
            accounts,
            data,
        }
    }
}

#[derive(BorshDeserialize, BorshSerialize)]
pub struct PhoenixSwapInstructionData {
    discriminator: [u8; 8],
}

impl PhoenixSwapInstructionData {
    pub fn new() -> Self {
        Self {
            discriminator: [99, 66, 223, 95, 236, 131, 26, 140],
        }
    }
}

/// Instruction builder for `PhoenixSwap`.
///
/// ### Accounts:
///
///   0. `[]` swap_program
///   1. `[]` log_authority
///   2. `[writable]` market
///   3. `[]` trader
///   4. `[writable]` base_account
///   5. `[writable]` quote_account
///   6. `[writable]` base_vault
///   7. `[writable]` quote_vault
///   8. `[optional]` token_program (default to `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`)
#[derive(Default)]
pub struct PhoenixSwapBuilder {
    swap_program: Option<solana_program::pubkey::Pubkey>,
    log_authority: Option<solana_program::pubkey::Pubkey>,
    market: Option<solana_program::pubkey::Pubkey>,
    trader: Option<solana_program::pubkey::Pubkey>,
    base_account: Option<solana_program::pubkey::Pubkey>,
    quote_account: Option<solana_program::pubkey::Pubkey>,
    base_vault: Option<solana_program::pubkey::Pubkey>,
    quote_vault: Option<solana_program::pubkey::Pubkey>,
    token_program: Option<solana_program::pubkey::Pubkey>,
    __remaining_accounts: Vec<solana_program::instruction::AccountMeta>,
}

impl PhoenixSwapBuilder {
    pub fn new() -> Self {
        Self::default()
    }
    #[inline(always)]
    pub fn swap_program(&mut self, swap_program: solana_program::pubkey::Pubkey) -> &mut Self {
        self.swap_program = Some(swap_program);
        self
    }
    #[inline(always)]
    pub fn log_authority(&mut self, log_authority: solana_program::pubkey::Pubkey) -> &mut Self {
        self.log_authority = Some(log_authority);
        self
    }
    #[inline(always)]
    pub fn market(&mut self, market: solana_program::pubkey::Pubkey) -> &mut Self {
        self.market = Some(market);
        self
    }
    #[inline(always)]
    pub fn trader(&mut self, trader: solana_program::pubkey::Pubkey) -> &mut Self {
        self.trader = Some(trader);
        self
    }
    #[inline(always)]
    pub fn base_account(&mut self, base_account: solana_program::pubkey::Pubkey) -> &mut Self {
        self.base_account = Some(base_account);
        self
    }
    #[inline(always)]
    pub fn quote_account(&mut self, quote_account: solana_program::pubkey::Pubkey) -> &mut Self {
        self.quote_account = Some(quote_account);
        self
    }
    #[inline(always)]
    pub fn base_vault(&mut self, base_vault: solana_program::pubkey::Pubkey) -> &mut Self {
        self.base_vault = Some(base_vault);
        self
    }
    #[inline(always)]
    pub fn quote_vault(&mut self, quote_vault: solana_program::pubkey::Pubkey) -> &mut Self {
        self.quote_vault = Some(quote_vault);
        self
    }
    /// `[optional account, default to 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA']`
    #[inline(always)]
    pub fn token_program(&mut self, token_program: solana_program::pubkey::Pubkey) -> &mut Self {
        self.token_program = Some(token_program);
        self
    }
    /// Add an aditional account to the instruction.
    #[inline(always)]
    pub fn add_remaining_account(
        &mut self,
        account: solana_program::instruction::AccountMeta,
    ) -> &mut Self {
        self.__remaining_accounts.push(account);
        self
    }
    /// Add additional accounts to the instruction.
    #[inline(always)]
    pub fn add_remaining_accounts(
        &mut self,
        accounts: &[solana_program::instruction::AccountMeta],
    ) -> &mut Self {
        self.__remaining_accounts.extend_from_slice(accounts);
        self
    }
    #[allow(clippy::clone_on_copy)]
    pub fn instruction(&self) -> solana_program::instruction::Instruction {
        let accounts = PhoenixSwap {
            swap_program: self.swap_program.expect("swap_program is not set"),
            log_authority: self.log_authority.expect("log_authority is not set"),
            market: self.market.expect("market is not set"),
            trader: self.trader.expect("trader is not set"),
            base_account: self.base_account.expect("base_account is not set"),
            quote_account: self.quote_account.expect("quote_account is not set"),
            base_vault: self.base_vault.expect("base_vault is not set"),
            quote_vault: self.quote_vault.expect("quote_vault is not set"),
            token_program: self.token_program.unwrap_or(solana_program::pubkey!(
                "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
            )),
        };

        accounts.instruction_with_remaining_accounts(&self.__remaining_accounts)
    }
}

/// `phoenix_swap` CPI accounts.
pub struct PhoenixSwapCpiAccounts<'a, 'b> {
    pub swap_program: &'b solana_program::account_info::AccountInfo<'a>,

    pub log_authority: &'b solana_program::account_info::AccountInfo<'a>,

    pub market: &'b solana_program::account_info::AccountInfo<'a>,

    pub trader: &'b solana_program::account_info::AccountInfo<'a>,

    pub base_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub quote_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub base_vault: &'b solana_program::account_info::AccountInfo<'a>,

    pub quote_vault: &'b solana_program::account_info::AccountInfo<'a>,

    pub token_program: &'b solana_program::account_info::AccountInfo<'a>,
}

/// `phoenix_swap` CPI instruction.
pub struct PhoenixSwapCpi<'a, 'b> {
    /// The program to invoke.
    pub __program: &'b solana_program::account_info::AccountInfo<'a>,

    pub swap_program: &'b solana_program::account_info::AccountInfo<'a>,

    pub log_authority: &'b solana_program::account_info::AccountInfo<'a>,

    pub market: &'b solana_program::account_info::AccountInfo<'a>,

    pub trader: &'b solana_program::account_info::AccountInfo<'a>,

    pub base_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub quote_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub base_vault: &'b solana_program::account_info::AccountInfo<'a>,

    pub quote_vault: &'b solana_program::account_info::AccountInfo<'a>,

    pub token_program: &'b solana_program::account_info::AccountInfo<'a>,
}

impl<'a, 'b> PhoenixSwapCpi<'a, 'b> {
    pub fn new(
        program: &'b solana_program::account_info::AccountInfo<'a>,
        accounts: PhoenixSwapCpiAccounts<'a, 'b>,
    ) -> Self {
        Self {
            __program: program,
            swap_program: accounts.swap_program,
            log_authority: accounts.log_authority,
            market: accounts.market,
            trader: accounts.trader,
            base_account: accounts.base_account,
            quote_account: accounts.quote_account,
            base_vault: accounts.base_vault,
            quote_vault: accounts.quote_vault,
            token_program: accounts.token_program,
        }
    }
    #[inline(always)]
    pub fn invoke(&self) -> solana_program::entrypoint::ProgramResult {
        self.invoke_signed_with_remaining_accounts(&[], &[])
    }
    #[inline(always)]
    pub fn invoke_with_remaining_accounts(
        &self,
        remaining_accounts: &[(
            &'b solana_program::account_info::AccountInfo<'a>,
            bool,
            bool,
        )],
    ) -> solana_program::entrypoint::ProgramResult {
        self.invoke_signed_with_remaining_accounts(&[], remaining_accounts)
    }
    #[inline(always)]
    pub fn invoke_signed(
        &self,
        signers_seeds: &[&[&[u8]]],
    ) -> solana_program::entrypoint::ProgramResult {
        self.invoke_signed_with_remaining_accounts(signers_seeds, &[])
    }
    #[allow(clippy::clone_on_copy)]
    #[allow(clippy::vec_init_then_push)]
    pub fn invoke_signed_with_remaining_accounts(
        &self,
        signers_seeds: &[&[&[u8]]],
        remaining_accounts: &[(
            &'b solana_program::account_info::AccountInfo<'a>,
            bool,
            bool,
        )],
    ) -> solana_program::entrypoint::ProgramResult {
        let mut accounts = Vec::with_capacity(9 + remaining_accounts.len());
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.swap_program.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.log_authority.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.market.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.trader.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.base_account.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.quote_account.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.base_vault.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.quote_vault.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.token_program.key,
            false,
        ));
        remaining_accounts.iter().for_each(|remaining_account| {
            accounts.push(solana_program::instruction::AccountMeta {
                pubkey: *remaining_account.0.key,
                is_signer: remaining_account.1,
                is_writable: remaining_account.2,
            })
        });
        let data = PhoenixSwapInstructionData::new().try_to_vec().unwrap();

        let instruction = solana_program::instruction::Instruction {
            program_id: crate::JUPITER_ID,
            accounts,
            data,
        };
        let mut account_infos = Vec::with_capacity(9 + 1 + remaining_accounts.len());
        account_infos.push(self.__program.clone());
        account_infos.push(self.swap_program.clone());
        account_infos.push(self.log_authority.clone());
        account_infos.push(self.market.clone());
        account_infos.push(self.trader.clone());
        account_infos.push(self.base_account.clone());
        account_infos.push(self.quote_account.clone());
        account_infos.push(self.base_vault.clone());
        account_infos.push(self.quote_vault.clone());
        account_infos.push(self.token_program.clone());
        remaining_accounts
            .iter()
            .for_each(|remaining_account| account_infos.push(remaining_account.0.clone()));

        if signers_seeds.is_empty() {
            solana_program::program::invoke(&instruction, &account_infos)
        } else {
            solana_program::program::invoke_signed(&instruction, &account_infos, signers_seeds)
        }
    }
}

/// Instruction builder for `PhoenixSwap` via CPI.
///
/// ### Accounts:
///
///   0. `[]` swap_program
///   1. `[]` log_authority
///   2. `[writable]` market
///   3. `[]` trader
///   4. `[writable]` base_account
///   5. `[writable]` quote_account
///   6. `[writable]` base_vault
///   7. `[writable]` quote_vault
///   8. `[]` token_program
pub struct PhoenixSwapCpiBuilder<'a, 'b> {
    instruction: Box<PhoenixSwapCpiBuilderInstruction<'a, 'b>>,
}

impl<'a, 'b> PhoenixSwapCpiBuilder<'a, 'b> {
    pub fn new(program: &'b solana_program::account_info::AccountInfo<'a>) -> Self {
        let instruction = Box::new(PhoenixSwapCpiBuilderInstruction {
            __program: program,
            swap_program: None,
            log_authority: None,
            market: None,
            trader: None,
            base_account: None,
            quote_account: None,
            base_vault: None,
            quote_vault: None,
            token_program: None,
            __remaining_accounts: Vec::new(),
        });
        Self { instruction }
    }
    #[inline(always)]
    pub fn swap_program(
        &mut self,
        swap_program: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.swap_program = Some(swap_program);
        self
    }
    #[inline(always)]
    pub fn log_authority(
        &mut self,
        log_authority: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.log_authority = Some(log_authority);
        self
    }
    #[inline(always)]
    pub fn market(
        &mut self,
        market: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.market = Some(market);
        self
    }
    #[inline(always)]
    pub fn trader(
        &mut self,
        trader: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.trader = Some(trader);
        self
    }
    #[inline(always)]
    pub fn base_account(
        &mut self,
        base_account: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.base_account = Some(base_account);
        self
    }
    #[inline(always)]
    pub fn quote_account(
        &mut self,
        quote_account: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.quote_account = Some(quote_account);
        self
    }
    #[inline(always)]
    pub fn base_vault(
        &mut self,
        base_vault: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.base_vault = Some(base_vault);
        self
    }
    #[inline(always)]
    pub fn quote_vault(
        &mut self,
        quote_vault: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.quote_vault = Some(quote_vault);
        self
    }
    #[inline(always)]
    pub fn token_program(
        &mut self,
        token_program: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.token_program = Some(token_program);
        self
    }
    /// Add an additional account to the instruction.
    #[inline(always)]
    pub fn add_remaining_account(
        &mut self,
        account: &'b solana_program::account_info::AccountInfo<'a>,
        is_writable: bool,
        is_signer: bool,
    ) -> &mut Self {
        self.instruction
            .__remaining_accounts
            .push((account, is_writable, is_signer));
        self
    }
    /// Add additional accounts to the instruction.
    ///
    /// Each account is represented by a tuple of the `AccountInfo`, a `bool` indicating whether the account is writable or not,
    /// and a `bool` indicating whether the account is a signer or not.
    #[inline(always)]
    pub fn add_remaining_accounts(
        &mut self,
        accounts: &[(
            &'b solana_program::account_info::AccountInfo<'a>,
            bool,
            bool,
        )],
    ) -> &mut Self {
        self.instruction
            .__remaining_accounts
            .extend_from_slice(accounts);
        self
    }
    #[inline(always)]
    pub fn invoke(&self) -> solana_program::entrypoint::ProgramResult {
        self.invoke_signed(&[])
    }
    #[allow(clippy::clone_on_copy)]
    #[allow(clippy::vec_init_then_push)]
    pub fn invoke_signed(
        &self,
        signers_seeds: &[&[&[u8]]],
    ) -> solana_program::entrypoint::ProgramResult {
        let instruction = PhoenixSwapCpi {
            __program: self.instruction.__program,

            swap_program: self
                .instruction
                .swap_program
                .expect("swap_program is not set"),

            log_authority: self
                .instruction
                .log_authority
                .expect("log_authority is not set"),

            market: self.instruction.market.expect("market is not set"),

            trader: self.instruction.trader.expect("trader is not set"),

            base_account: self
                .instruction
                .base_account
                .expect("base_account is not set"),

            quote_account: self
                .instruction
                .quote_account
                .expect("quote_account is not set"),

            base_vault: self.instruction.base_vault.expect("base_vault is not set"),

            quote_vault: self
                .instruction
                .quote_vault
                .expect("quote_vault is not set"),

            token_program: self
                .instruction
                .token_program
                .expect("token_program is not set"),
        };
        instruction.invoke_signed_with_remaining_accounts(
            signers_seeds,
            &self.instruction.__remaining_accounts,
        )
    }
}

struct PhoenixSwapCpiBuilderInstruction<'a, 'b> {
    __program: &'b solana_program::account_info::AccountInfo<'a>,
    swap_program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    log_authority: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    market: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    trader: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    base_account: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    quote_account: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    base_vault: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    quote_vault: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    token_program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    /// Additional instruction accounts `(AccountInfo, is_writable, is_signer)`.
    __remaining_accounts: Vec<(
        &'b solana_program::account_info::AccountInfo<'a>,
        bool,
        bool,
    )>,
}
