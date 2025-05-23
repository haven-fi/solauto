//! This code was AUTOGENERATED using the kinobi library.
//! Please DO NOT EDIT THIS FILE, instead use visitors
//! to add features, then rerun kinobi to update it.
//!
//! [https://github.com/metaplex-foundation/kinobi]
//!

use borsh::BorshDeserialize;
use borsh::BorshSerialize;

/// Accounts.
pub struct LendingPoolCollectBankFees {
    pub marginfi_group: solana_program::pubkey::Pubkey,

    pub bank: solana_program::pubkey::Pubkey,

    pub liquidity_vault_authority: solana_program::pubkey::Pubkey,

    pub liquidity_vault: solana_program::pubkey::Pubkey,

    pub insurance_vault: solana_program::pubkey::Pubkey,

    pub fee_vault: solana_program::pubkey::Pubkey,

    pub token_program: solana_program::pubkey::Pubkey,
}

impl LendingPoolCollectBankFees {
    pub fn instruction(&self) -> solana_program::instruction::Instruction {
        self.instruction_with_remaining_accounts(&[])
    }
    #[allow(clippy::vec_init_then_push)]
    pub fn instruction_with_remaining_accounts(
        &self,
        remaining_accounts: &[solana_program::instruction::AccountMeta],
    ) -> solana_program::instruction::Instruction {
        let mut accounts = Vec::with_capacity(7 + remaining_accounts.len());
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.marginfi_group,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.bank, false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.liquidity_vault_authority,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.liquidity_vault,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.insurance_vault,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.fee_vault,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.token_program,
            false,
        ));
        accounts.extend_from_slice(remaining_accounts);
        let data = LendingPoolCollectBankFeesInstructionData::new()
            .try_to_vec()
            .unwrap();

        solana_program::instruction::Instruction {
            program_id: crate::MARGINFI_ID,
            accounts,
            data,
        }
    }
}

#[derive(BorshDeserialize, BorshSerialize)]
pub struct LendingPoolCollectBankFeesInstructionData {
    discriminator: [u8; 8],
}

impl LendingPoolCollectBankFeesInstructionData {
    pub fn new() -> Self {
        Self {
            discriminator: [201, 5, 215, 116, 230, 92, 75, 150],
        }
    }
}

/// Instruction builder for `LendingPoolCollectBankFees`.
///
/// ### Accounts:
///
///   0. `[]` marginfi_group
///   1. `[writable]` bank
///   2. `[]` liquidity_vault_authority
///   3. `[writable]` liquidity_vault
///   4. `[writable]` insurance_vault
///   5. `[writable]` fee_vault
///   6. `[optional]` token_program (default to `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`)
#[derive(Default)]
pub struct LendingPoolCollectBankFeesBuilder {
    marginfi_group: Option<solana_program::pubkey::Pubkey>,
    bank: Option<solana_program::pubkey::Pubkey>,
    liquidity_vault_authority: Option<solana_program::pubkey::Pubkey>,
    liquidity_vault: Option<solana_program::pubkey::Pubkey>,
    insurance_vault: Option<solana_program::pubkey::Pubkey>,
    fee_vault: Option<solana_program::pubkey::Pubkey>,
    token_program: Option<solana_program::pubkey::Pubkey>,
    __remaining_accounts: Vec<solana_program::instruction::AccountMeta>,
}

impl LendingPoolCollectBankFeesBuilder {
    pub fn new() -> Self {
        Self::default()
    }
    #[inline(always)]
    pub fn marginfi_group(&mut self, marginfi_group: solana_program::pubkey::Pubkey) -> &mut Self {
        self.marginfi_group = Some(marginfi_group);
        self
    }
    #[inline(always)]
    pub fn bank(&mut self, bank: solana_program::pubkey::Pubkey) -> &mut Self {
        self.bank = Some(bank);
        self
    }
    #[inline(always)]
    pub fn liquidity_vault_authority(
        &mut self,
        liquidity_vault_authority: solana_program::pubkey::Pubkey,
    ) -> &mut Self {
        self.liquidity_vault_authority = Some(liquidity_vault_authority);
        self
    }
    #[inline(always)]
    pub fn liquidity_vault(
        &mut self,
        liquidity_vault: solana_program::pubkey::Pubkey,
    ) -> &mut Self {
        self.liquidity_vault = Some(liquidity_vault);
        self
    }
    #[inline(always)]
    pub fn insurance_vault(
        &mut self,
        insurance_vault: solana_program::pubkey::Pubkey,
    ) -> &mut Self {
        self.insurance_vault = Some(insurance_vault);
        self
    }
    #[inline(always)]
    pub fn fee_vault(&mut self, fee_vault: solana_program::pubkey::Pubkey) -> &mut Self {
        self.fee_vault = Some(fee_vault);
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
        let accounts = LendingPoolCollectBankFees {
            marginfi_group: self.marginfi_group.expect("marginfi_group is not set"),
            bank: self.bank.expect("bank is not set"),
            liquidity_vault_authority: self
                .liquidity_vault_authority
                .expect("liquidity_vault_authority is not set"),
            liquidity_vault: self.liquidity_vault.expect("liquidity_vault is not set"),
            insurance_vault: self.insurance_vault.expect("insurance_vault is not set"),
            fee_vault: self.fee_vault.expect("fee_vault is not set"),
            token_program: self.token_program.unwrap_or(solana_program::pubkey!(
                "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
            )),
        };

        accounts.instruction_with_remaining_accounts(&self.__remaining_accounts)
    }
}

/// `lending_pool_collect_bank_fees` CPI accounts.
pub struct LendingPoolCollectBankFeesCpiAccounts<'a, 'b> {
    pub marginfi_group: &'b solana_program::account_info::AccountInfo<'a>,

    pub bank: &'b solana_program::account_info::AccountInfo<'a>,

    pub liquidity_vault_authority: &'b solana_program::account_info::AccountInfo<'a>,

    pub liquidity_vault: &'b solana_program::account_info::AccountInfo<'a>,

    pub insurance_vault: &'b solana_program::account_info::AccountInfo<'a>,

    pub fee_vault: &'b solana_program::account_info::AccountInfo<'a>,

    pub token_program: &'b solana_program::account_info::AccountInfo<'a>,
}

/// `lending_pool_collect_bank_fees` CPI instruction.
pub struct LendingPoolCollectBankFeesCpi<'a, 'b> {
    /// The program to invoke.
    pub __program: &'b solana_program::account_info::AccountInfo<'a>,

    pub marginfi_group: &'b solana_program::account_info::AccountInfo<'a>,

    pub bank: &'b solana_program::account_info::AccountInfo<'a>,

    pub liquidity_vault_authority: &'b solana_program::account_info::AccountInfo<'a>,

    pub liquidity_vault: &'b solana_program::account_info::AccountInfo<'a>,

    pub insurance_vault: &'b solana_program::account_info::AccountInfo<'a>,

    pub fee_vault: &'b solana_program::account_info::AccountInfo<'a>,

    pub token_program: &'b solana_program::account_info::AccountInfo<'a>,
}

impl<'a, 'b> LendingPoolCollectBankFeesCpi<'a, 'b> {
    pub fn new(
        program: &'b solana_program::account_info::AccountInfo<'a>,
        accounts: LendingPoolCollectBankFeesCpiAccounts<'a, 'b>,
    ) -> Self {
        Self {
            __program: program,
            marginfi_group: accounts.marginfi_group,
            bank: accounts.bank,
            liquidity_vault_authority: accounts.liquidity_vault_authority,
            liquidity_vault: accounts.liquidity_vault,
            insurance_vault: accounts.insurance_vault,
            fee_vault: accounts.fee_vault,
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
        let mut accounts = Vec::with_capacity(7 + remaining_accounts.len());
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.marginfi_group.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.bank.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.liquidity_vault_authority.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.liquidity_vault.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.insurance_vault.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.fee_vault.key,
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
        let data = LendingPoolCollectBankFeesInstructionData::new()
            .try_to_vec()
            .unwrap();

        let instruction = solana_program::instruction::Instruction {
            program_id: crate::MARGINFI_ID,
            accounts,
            data,
        };
        let mut account_infos = Vec::with_capacity(7 + 1 + remaining_accounts.len());
        account_infos.push(self.__program.clone());
        account_infos.push(self.marginfi_group.clone());
        account_infos.push(self.bank.clone());
        account_infos.push(self.liquidity_vault_authority.clone());
        account_infos.push(self.liquidity_vault.clone());
        account_infos.push(self.insurance_vault.clone());
        account_infos.push(self.fee_vault.clone());
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

/// Instruction builder for `LendingPoolCollectBankFees` via CPI.
///
/// ### Accounts:
///
///   0. `[]` marginfi_group
///   1. `[writable]` bank
///   2. `[]` liquidity_vault_authority
///   3. `[writable]` liquidity_vault
///   4. `[writable]` insurance_vault
///   5. `[writable]` fee_vault
///   6. `[]` token_program
pub struct LendingPoolCollectBankFeesCpiBuilder<'a, 'b> {
    instruction: Box<LendingPoolCollectBankFeesCpiBuilderInstruction<'a, 'b>>,
}

impl<'a, 'b> LendingPoolCollectBankFeesCpiBuilder<'a, 'b> {
    pub fn new(program: &'b solana_program::account_info::AccountInfo<'a>) -> Self {
        let instruction = Box::new(LendingPoolCollectBankFeesCpiBuilderInstruction {
            __program: program,
            marginfi_group: None,
            bank: None,
            liquidity_vault_authority: None,
            liquidity_vault: None,
            insurance_vault: None,
            fee_vault: None,
            token_program: None,
            __remaining_accounts: Vec::new(),
        });
        Self { instruction }
    }
    #[inline(always)]
    pub fn marginfi_group(
        &mut self,
        marginfi_group: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.marginfi_group = Some(marginfi_group);
        self
    }
    #[inline(always)]
    pub fn bank(&mut self, bank: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
        self.instruction.bank = Some(bank);
        self
    }
    #[inline(always)]
    pub fn liquidity_vault_authority(
        &mut self,
        liquidity_vault_authority: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.liquidity_vault_authority = Some(liquidity_vault_authority);
        self
    }
    #[inline(always)]
    pub fn liquidity_vault(
        &mut self,
        liquidity_vault: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.liquidity_vault = Some(liquidity_vault);
        self
    }
    #[inline(always)]
    pub fn insurance_vault(
        &mut self,
        insurance_vault: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.insurance_vault = Some(insurance_vault);
        self
    }
    #[inline(always)]
    pub fn fee_vault(
        &mut self,
        fee_vault: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.fee_vault = Some(fee_vault);
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
        let instruction = LendingPoolCollectBankFeesCpi {
            __program: self.instruction.__program,

            marginfi_group: self
                .instruction
                .marginfi_group
                .expect("marginfi_group is not set"),

            bank: self.instruction.bank.expect("bank is not set"),

            liquidity_vault_authority: self
                .instruction
                .liquidity_vault_authority
                .expect("liquidity_vault_authority is not set"),

            liquidity_vault: self
                .instruction
                .liquidity_vault
                .expect("liquidity_vault is not set"),

            insurance_vault: self
                .instruction
                .insurance_vault
                .expect("insurance_vault is not set"),

            fee_vault: self.instruction.fee_vault.expect("fee_vault is not set"),

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

struct LendingPoolCollectBankFeesCpiBuilderInstruction<'a, 'b> {
    __program: &'b solana_program::account_info::AccountInfo<'a>,
    marginfi_group: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    bank: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    liquidity_vault_authority: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    liquidity_vault: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    insurance_vault: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    fee_vault: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    token_program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    /// Additional instruction accounts `(AccountInfo, is_writable, is_signer)`.
    __remaining_accounts: Vec<(
        &'b solana_program::account_info::AccountInfo<'a>,
        bool,
        bool,
    )>,
}
