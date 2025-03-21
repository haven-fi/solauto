//! This code was AUTOGENERATED using the kinobi library.
//! Please DO NOT EDIT THIS FILE, instead use visitors
//! to add features, then rerun kinobi to update it.
//!
//! [https://github.com/metaplex-foundation/kinobi]
//!

use borsh::BorshDeserialize;
use borsh::BorshSerialize;

/// Accounts.
pub struct SaberSwap {
    pub swap_program: solana_program::pubkey::Pubkey,

    pub token_program: solana_program::pubkey::Pubkey,

    pub swap: solana_program::pubkey::Pubkey,

    pub swap_authority: solana_program::pubkey::Pubkey,

    pub user_authority: solana_program::pubkey::Pubkey,

    pub input_user_account: solana_program::pubkey::Pubkey,

    pub input_token_account: solana_program::pubkey::Pubkey,

    pub output_user_account: solana_program::pubkey::Pubkey,

    pub output_token_account: solana_program::pubkey::Pubkey,

    pub fees_token_account: solana_program::pubkey::Pubkey,
}

impl SaberSwap {
    pub fn instruction(&self) -> solana_program::instruction::Instruction {
        self.instruction_with_remaining_accounts(&[])
    }
    #[allow(clippy::vec_init_then_push)]
    pub fn instruction_with_remaining_accounts(
        &self,
        remaining_accounts: &[solana_program::instruction::AccountMeta],
    ) -> solana_program::instruction::Instruction {
        let mut accounts = Vec::with_capacity(10 + remaining_accounts.len());
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.swap_program,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.token_program,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.swap, false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.swap_authority,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.user_authority,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.input_user_account,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.input_token_account,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.output_user_account,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.output_token_account,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.fees_token_account,
            false,
        ));
        accounts.extend_from_slice(remaining_accounts);
        let data = SaberSwapInstructionData::new().try_to_vec().unwrap();

        solana_program::instruction::Instruction {
            program_id: crate::JUPITER_ID,
            accounts,
            data,
        }
    }
}

#[derive(BorshDeserialize, BorshSerialize)]
pub struct SaberSwapInstructionData {
    discriminator: [u8; 8],
}

impl SaberSwapInstructionData {
    pub fn new() -> Self {
        Self {
            discriminator: [64, 62, 98, 226, 52, 74, 37, 178],
        }
    }
}

/// Instruction builder for `SaberSwap`.
///
/// ### Accounts:
///
///   0. `[]` swap_program
///   1. `[optional]` token_program (default to `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`)
///   2. `[]` swap
///   3. `[]` swap_authority
///   4. `[]` user_authority
///   5. `[writable]` input_user_account
///   6. `[writable]` input_token_account
///   7. `[writable]` output_user_account
///   8. `[writable]` output_token_account
///   9. `[writable]` fees_token_account
#[derive(Default)]
pub struct SaberSwapBuilder {
    swap_program: Option<solana_program::pubkey::Pubkey>,
    token_program: Option<solana_program::pubkey::Pubkey>,
    swap: Option<solana_program::pubkey::Pubkey>,
    swap_authority: Option<solana_program::pubkey::Pubkey>,
    user_authority: Option<solana_program::pubkey::Pubkey>,
    input_user_account: Option<solana_program::pubkey::Pubkey>,
    input_token_account: Option<solana_program::pubkey::Pubkey>,
    output_user_account: Option<solana_program::pubkey::Pubkey>,
    output_token_account: Option<solana_program::pubkey::Pubkey>,
    fees_token_account: Option<solana_program::pubkey::Pubkey>,
    __remaining_accounts: Vec<solana_program::instruction::AccountMeta>,
}

impl SaberSwapBuilder {
    pub fn new() -> Self {
        Self::default()
    }
    #[inline(always)]
    pub fn swap_program(&mut self, swap_program: solana_program::pubkey::Pubkey) -> &mut Self {
        self.swap_program = Some(swap_program);
        self
    }
    /// `[optional account, default to 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA']`
    #[inline(always)]
    pub fn token_program(&mut self, token_program: solana_program::pubkey::Pubkey) -> &mut Self {
        self.token_program = Some(token_program);
        self
    }
    #[inline(always)]
    pub fn swap(&mut self, swap: solana_program::pubkey::Pubkey) -> &mut Self {
        self.swap = Some(swap);
        self
    }
    #[inline(always)]
    pub fn swap_authority(&mut self, swap_authority: solana_program::pubkey::Pubkey) -> &mut Self {
        self.swap_authority = Some(swap_authority);
        self
    }
    #[inline(always)]
    pub fn user_authority(&mut self, user_authority: solana_program::pubkey::Pubkey) -> &mut Self {
        self.user_authority = Some(user_authority);
        self
    }
    #[inline(always)]
    pub fn input_user_account(
        &mut self,
        input_user_account: solana_program::pubkey::Pubkey,
    ) -> &mut Self {
        self.input_user_account = Some(input_user_account);
        self
    }
    #[inline(always)]
    pub fn input_token_account(
        &mut self,
        input_token_account: solana_program::pubkey::Pubkey,
    ) -> &mut Self {
        self.input_token_account = Some(input_token_account);
        self
    }
    #[inline(always)]
    pub fn output_user_account(
        &mut self,
        output_user_account: solana_program::pubkey::Pubkey,
    ) -> &mut Self {
        self.output_user_account = Some(output_user_account);
        self
    }
    #[inline(always)]
    pub fn output_token_account(
        &mut self,
        output_token_account: solana_program::pubkey::Pubkey,
    ) -> &mut Self {
        self.output_token_account = Some(output_token_account);
        self
    }
    #[inline(always)]
    pub fn fees_token_account(
        &mut self,
        fees_token_account: solana_program::pubkey::Pubkey,
    ) -> &mut Self {
        self.fees_token_account = Some(fees_token_account);
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
        let accounts = SaberSwap {
            swap_program: self.swap_program.expect("swap_program is not set"),
            token_program: self.token_program.unwrap_or(solana_program::pubkey!(
                "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
            )),
            swap: self.swap.expect("swap is not set"),
            swap_authority: self.swap_authority.expect("swap_authority is not set"),
            user_authority: self.user_authority.expect("user_authority is not set"),
            input_user_account: self
                .input_user_account
                .expect("input_user_account is not set"),
            input_token_account: self
                .input_token_account
                .expect("input_token_account is not set"),
            output_user_account: self
                .output_user_account
                .expect("output_user_account is not set"),
            output_token_account: self
                .output_token_account
                .expect("output_token_account is not set"),
            fees_token_account: self
                .fees_token_account
                .expect("fees_token_account is not set"),
        };

        accounts.instruction_with_remaining_accounts(&self.__remaining_accounts)
    }
}

/// `saber_swap` CPI accounts.
pub struct SaberSwapCpiAccounts<'a, 'b> {
    pub swap_program: &'b solana_program::account_info::AccountInfo<'a>,

    pub token_program: &'b solana_program::account_info::AccountInfo<'a>,

    pub swap: &'b solana_program::account_info::AccountInfo<'a>,

    pub swap_authority: &'b solana_program::account_info::AccountInfo<'a>,

    pub user_authority: &'b solana_program::account_info::AccountInfo<'a>,

    pub input_user_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub input_token_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub output_user_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub output_token_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub fees_token_account: &'b solana_program::account_info::AccountInfo<'a>,
}

/// `saber_swap` CPI instruction.
pub struct SaberSwapCpi<'a, 'b> {
    /// The program to invoke.
    pub __program: &'b solana_program::account_info::AccountInfo<'a>,

    pub swap_program: &'b solana_program::account_info::AccountInfo<'a>,

    pub token_program: &'b solana_program::account_info::AccountInfo<'a>,

    pub swap: &'b solana_program::account_info::AccountInfo<'a>,

    pub swap_authority: &'b solana_program::account_info::AccountInfo<'a>,

    pub user_authority: &'b solana_program::account_info::AccountInfo<'a>,

    pub input_user_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub input_token_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub output_user_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub output_token_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub fees_token_account: &'b solana_program::account_info::AccountInfo<'a>,
}

impl<'a, 'b> SaberSwapCpi<'a, 'b> {
    pub fn new(
        program: &'b solana_program::account_info::AccountInfo<'a>,
        accounts: SaberSwapCpiAccounts<'a, 'b>,
    ) -> Self {
        Self {
            __program: program,
            swap_program: accounts.swap_program,
            token_program: accounts.token_program,
            swap: accounts.swap,
            swap_authority: accounts.swap_authority,
            user_authority: accounts.user_authority,
            input_user_account: accounts.input_user_account,
            input_token_account: accounts.input_token_account,
            output_user_account: accounts.output_user_account,
            output_token_account: accounts.output_token_account,
            fees_token_account: accounts.fees_token_account,
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
        let mut accounts = Vec::with_capacity(10 + remaining_accounts.len());
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.swap_program.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.token_program.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.swap.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.swap_authority.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.user_authority.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.input_user_account.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.input_token_account.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.output_user_account.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.output_token_account.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.fees_token_account.key,
            false,
        ));
        remaining_accounts.iter().for_each(|remaining_account| {
            accounts.push(solana_program::instruction::AccountMeta {
                pubkey: *remaining_account.0.key,
                is_signer: remaining_account.1,
                is_writable: remaining_account.2,
            })
        });
        let data = SaberSwapInstructionData::new().try_to_vec().unwrap();

        let instruction = solana_program::instruction::Instruction {
            program_id: crate::JUPITER_ID,
            accounts,
            data,
        };
        let mut account_infos = Vec::with_capacity(10 + 1 + remaining_accounts.len());
        account_infos.push(self.__program.clone());
        account_infos.push(self.swap_program.clone());
        account_infos.push(self.token_program.clone());
        account_infos.push(self.swap.clone());
        account_infos.push(self.swap_authority.clone());
        account_infos.push(self.user_authority.clone());
        account_infos.push(self.input_user_account.clone());
        account_infos.push(self.input_token_account.clone());
        account_infos.push(self.output_user_account.clone());
        account_infos.push(self.output_token_account.clone());
        account_infos.push(self.fees_token_account.clone());
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

/// Instruction builder for `SaberSwap` via CPI.
///
/// ### Accounts:
///
///   0. `[]` swap_program
///   1. `[]` token_program
///   2. `[]` swap
///   3. `[]` swap_authority
///   4. `[]` user_authority
///   5. `[writable]` input_user_account
///   6. `[writable]` input_token_account
///   7. `[writable]` output_user_account
///   8. `[writable]` output_token_account
///   9. `[writable]` fees_token_account
pub struct SaberSwapCpiBuilder<'a, 'b> {
    instruction: Box<SaberSwapCpiBuilderInstruction<'a, 'b>>,
}

impl<'a, 'b> SaberSwapCpiBuilder<'a, 'b> {
    pub fn new(program: &'b solana_program::account_info::AccountInfo<'a>) -> Self {
        let instruction = Box::new(SaberSwapCpiBuilderInstruction {
            __program: program,
            swap_program: None,
            token_program: None,
            swap: None,
            swap_authority: None,
            user_authority: None,
            input_user_account: None,
            input_token_account: None,
            output_user_account: None,
            output_token_account: None,
            fees_token_account: None,
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
    pub fn token_program(
        &mut self,
        token_program: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.token_program = Some(token_program);
        self
    }
    #[inline(always)]
    pub fn swap(&mut self, swap: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
        self.instruction.swap = Some(swap);
        self
    }
    #[inline(always)]
    pub fn swap_authority(
        &mut self,
        swap_authority: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.swap_authority = Some(swap_authority);
        self
    }
    #[inline(always)]
    pub fn user_authority(
        &mut self,
        user_authority: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.user_authority = Some(user_authority);
        self
    }
    #[inline(always)]
    pub fn input_user_account(
        &mut self,
        input_user_account: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.input_user_account = Some(input_user_account);
        self
    }
    #[inline(always)]
    pub fn input_token_account(
        &mut self,
        input_token_account: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.input_token_account = Some(input_token_account);
        self
    }
    #[inline(always)]
    pub fn output_user_account(
        &mut self,
        output_user_account: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.output_user_account = Some(output_user_account);
        self
    }
    #[inline(always)]
    pub fn output_token_account(
        &mut self,
        output_token_account: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.output_token_account = Some(output_token_account);
        self
    }
    #[inline(always)]
    pub fn fees_token_account(
        &mut self,
        fees_token_account: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.fees_token_account = Some(fees_token_account);
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
        let instruction = SaberSwapCpi {
            __program: self.instruction.__program,

            swap_program: self
                .instruction
                .swap_program
                .expect("swap_program is not set"),

            token_program: self
                .instruction
                .token_program
                .expect("token_program is not set"),

            swap: self.instruction.swap.expect("swap is not set"),

            swap_authority: self
                .instruction
                .swap_authority
                .expect("swap_authority is not set"),

            user_authority: self
                .instruction
                .user_authority
                .expect("user_authority is not set"),

            input_user_account: self
                .instruction
                .input_user_account
                .expect("input_user_account is not set"),

            input_token_account: self
                .instruction
                .input_token_account
                .expect("input_token_account is not set"),

            output_user_account: self
                .instruction
                .output_user_account
                .expect("output_user_account is not set"),

            output_token_account: self
                .instruction
                .output_token_account
                .expect("output_token_account is not set"),

            fees_token_account: self
                .instruction
                .fees_token_account
                .expect("fees_token_account is not set"),
        };
        instruction.invoke_signed_with_remaining_accounts(
            signers_seeds,
            &self.instruction.__remaining_accounts,
        )
    }
}

struct SaberSwapCpiBuilderInstruction<'a, 'b> {
    __program: &'b solana_program::account_info::AccountInfo<'a>,
    swap_program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    token_program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    swap: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    swap_authority: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    user_authority: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    input_user_account: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    input_token_account: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    output_user_account: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    output_token_account: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    fees_token_account: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    /// Additional instruction accounts `(AccountInfo, is_writable, is_signer)`.
    __remaining_accounts: Vec<(
        &'b solana_program::account_info::AccountInfo<'a>,
        bool,
        bool,
    )>,
}
