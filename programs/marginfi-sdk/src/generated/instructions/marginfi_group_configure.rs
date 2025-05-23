//! This code was AUTOGENERATED using the kinobi library.
//! Please DO NOT EDIT THIS FILE, instead use visitors
//! to add features, then rerun kinobi to update it.
//!
//! [https://github.com/metaplex-foundation/kinobi]
//!

use borsh::BorshDeserialize;
use borsh::BorshSerialize;
use solana_program::pubkey::Pubkey;

/// Accounts.
pub struct MarginfiGroupConfigure {
    pub marginfi_group: solana_program::pubkey::Pubkey,

    pub admin: solana_program::pubkey::Pubkey,
}

impl MarginfiGroupConfigure {
    pub fn instruction(
        &self,
        args: MarginfiGroupConfigureInstructionArgs,
    ) -> solana_program::instruction::Instruction {
        self.instruction_with_remaining_accounts(args, &[])
    }
    #[allow(clippy::vec_init_then_push)]
    pub fn instruction_with_remaining_accounts(
        &self,
        args: MarginfiGroupConfigureInstructionArgs,
        remaining_accounts: &[solana_program::instruction::AccountMeta],
    ) -> solana_program::instruction::Instruction {
        let mut accounts = Vec::with_capacity(2 + remaining_accounts.len());
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.marginfi_group,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.admin, true,
        ));
        accounts.extend_from_slice(remaining_accounts);
        let mut data = MarginfiGroupConfigureInstructionData::new()
            .try_to_vec()
            .unwrap();
        let mut args = args.try_to_vec().unwrap();
        data.append(&mut args);

        solana_program::instruction::Instruction {
            program_id: crate::MARGINFI_ID,
            accounts,
            data,
        }
    }
}

#[derive(BorshDeserialize, BorshSerialize)]
pub struct MarginfiGroupConfigureInstructionData {
    discriminator: [u8; 8],
}

impl MarginfiGroupConfigureInstructionData {
    pub fn new() -> Self {
        Self {
            discriminator: [62, 199, 81, 78, 33, 13, 236, 61],
        }
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct MarginfiGroupConfigureInstructionArgs {
    pub admin_arg: Option<Pubkey>,
}

/// Instruction builder for `MarginfiGroupConfigure`.
///
/// ### Accounts:
///
///   0. `[writable]` marginfi_group
///   1. `[signer]` admin
#[derive(Default)]
pub struct MarginfiGroupConfigureBuilder {
    marginfi_group: Option<solana_program::pubkey::Pubkey>,
    admin: Option<solana_program::pubkey::Pubkey>,
    admin_arg: Option<Pubkey>,
    __remaining_accounts: Vec<solana_program::instruction::AccountMeta>,
}

impl MarginfiGroupConfigureBuilder {
    pub fn new() -> Self {
        Self::default()
    }
    #[inline(always)]
    pub fn marginfi_group(&mut self, marginfi_group: solana_program::pubkey::Pubkey) -> &mut Self {
        self.marginfi_group = Some(marginfi_group);
        self
    }
    #[inline(always)]
    pub fn admin(&mut self, admin: solana_program::pubkey::Pubkey) -> &mut Self {
        self.admin = Some(admin);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn admin_arg(&mut self, admin_arg: Pubkey) -> &mut Self {
        self.admin_arg = Some(admin_arg);
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
        let accounts = MarginfiGroupConfigure {
            marginfi_group: self.marginfi_group.expect("marginfi_group is not set"),
            admin: self.admin.expect("admin is not set"),
        };
        let args = MarginfiGroupConfigureInstructionArgs {
            admin_arg: self.admin_arg.clone(),
        };

        accounts.instruction_with_remaining_accounts(args, &self.__remaining_accounts)
    }
}

/// `marginfi_group_configure` CPI accounts.
pub struct MarginfiGroupConfigureCpiAccounts<'a, 'b> {
    pub marginfi_group: &'b solana_program::account_info::AccountInfo<'a>,

    pub admin: &'b solana_program::account_info::AccountInfo<'a>,
}

/// `marginfi_group_configure` CPI instruction.
pub struct MarginfiGroupConfigureCpi<'a, 'b> {
    /// The program to invoke.
    pub __program: &'b solana_program::account_info::AccountInfo<'a>,

    pub marginfi_group: &'b solana_program::account_info::AccountInfo<'a>,

    pub admin: &'b solana_program::account_info::AccountInfo<'a>,
    /// The arguments for the instruction.
    pub __args: MarginfiGroupConfigureInstructionArgs,
}

impl<'a, 'b> MarginfiGroupConfigureCpi<'a, 'b> {
    pub fn new(
        program: &'b solana_program::account_info::AccountInfo<'a>,
        accounts: MarginfiGroupConfigureCpiAccounts<'a, 'b>,
        args: MarginfiGroupConfigureInstructionArgs,
    ) -> Self {
        Self {
            __program: program,
            marginfi_group: accounts.marginfi_group,
            admin: accounts.admin,
            __args: args,
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
        let mut accounts = Vec::with_capacity(2 + remaining_accounts.len());
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.marginfi_group.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.admin.key,
            true,
        ));
        remaining_accounts.iter().for_each(|remaining_account| {
            accounts.push(solana_program::instruction::AccountMeta {
                pubkey: *remaining_account.0.key,
                is_signer: remaining_account.1,
                is_writable: remaining_account.2,
            })
        });
        let mut data = MarginfiGroupConfigureInstructionData::new()
            .try_to_vec()
            .unwrap();
        let mut args = self.__args.try_to_vec().unwrap();
        data.append(&mut args);

        let instruction = solana_program::instruction::Instruction {
            program_id: crate::MARGINFI_ID,
            accounts,
            data,
        };
        let mut account_infos = Vec::with_capacity(2 + 1 + remaining_accounts.len());
        account_infos.push(self.__program.clone());
        account_infos.push(self.marginfi_group.clone());
        account_infos.push(self.admin.clone());
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

/// Instruction builder for `MarginfiGroupConfigure` via CPI.
///
/// ### Accounts:
///
///   0. `[writable]` marginfi_group
///   1. `[signer]` admin
pub struct MarginfiGroupConfigureCpiBuilder<'a, 'b> {
    instruction: Box<MarginfiGroupConfigureCpiBuilderInstruction<'a, 'b>>,
}

impl<'a, 'b> MarginfiGroupConfigureCpiBuilder<'a, 'b> {
    pub fn new(program: &'b solana_program::account_info::AccountInfo<'a>) -> Self {
        let instruction = Box::new(MarginfiGroupConfigureCpiBuilderInstruction {
            __program: program,
            marginfi_group: None,
            admin: None,
            admin_arg: None,
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
    pub fn admin(&mut self, admin: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
        self.instruction.admin = Some(admin);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn admin_arg(&mut self, admin_arg: Pubkey) -> &mut Self {
        self.instruction.admin_arg = Some(admin_arg);
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
        let args = MarginfiGroupConfigureInstructionArgs {
            admin_arg: self.instruction.admin_arg.clone(),
        };
        let instruction = MarginfiGroupConfigureCpi {
            __program: self.instruction.__program,

            marginfi_group: self
                .instruction
                .marginfi_group
                .expect("marginfi_group is not set"),

            admin: self.instruction.admin.expect("admin is not set"),
            __args: args,
        };
        instruction.invoke_signed_with_remaining_accounts(
            signers_seeds,
            &self.instruction.__remaining_accounts,
        )
    }
}

struct MarginfiGroupConfigureCpiBuilderInstruction<'a, 'b> {
    __program: &'b solana_program::account_info::AccountInfo<'a>,
    marginfi_group: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    admin: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    admin_arg: Option<Pubkey>,
    /// Additional instruction accounts `(AccountInfo, is_writable, is_signer)`.
    __remaining_accounts: Vec<(
        &'b solana_program::account_info::AccountInfo<'a>,
        bool,
        bool,
    )>,
}
