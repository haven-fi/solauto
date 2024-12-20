//! This code was AUTOGENERATED using the kinobi library.
//! Please DO NOT EDIT THIS FILE, instead use visitors
//! to add features, then rerun kinobi to update it.
//!
//! [https://github.com/metaplex-foundation/kinobi]
//!

use borsh::BorshDeserialize;
use borsh::BorshSerialize;

/// Accounts.
pub struct InvariantSwap {
    pub swap_program: solana_program::pubkey::Pubkey,

    pub state: solana_program::pubkey::Pubkey,

    pub pool: solana_program::pubkey::Pubkey,

    pub tickmap: solana_program::pubkey::Pubkey,

    pub account_x: solana_program::pubkey::Pubkey,

    pub account_y: solana_program::pubkey::Pubkey,

    pub reserve_x: solana_program::pubkey::Pubkey,

    pub reserve_y: solana_program::pubkey::Pubkey,

    pub owner: solana_program::pubkey::Pubkey,

    pub program_authority: solana_program::pubkey::Pubkey,

    pub token_program: solana_program::pubkey::Pubkey,
}

impl InvariantSwap {
    pub fn instruction(&self) -> solana_program::instruction::Instruction {
        self.instruction_with_remaining_accounts(&[])
    }
    #[allow(clippy::vec_init_then_push)]
    pub fn instruction_with_remaining_accounts(
        &self,
        remaining_accounts: &[solana_program::instruction::AccountMeta],
    ) -> solana_program::instruction::Instruction {
        let mut accounts = Vec::with_capacity(11 + remaining_accounts.len());
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.swap_program,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.state, false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.pool, false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.tickmap,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.account_x,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.account_y,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.reserve_x,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.reserve_y,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.owner, false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.program_authority,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.token_program,
            false,
        ));
        accounts.extend_from_slice(remaining_accounts);
        let data = InvariantSwapInstructionData::new().try_to_vec().unwrap();

        solana_program::instruction::Instruction {
            program_id: crate::JUPITER_ID,
            accounts,
            data,
        }
    }
}

#[derive(BorshDeserialize, BorshSerialize)]
pub struct InvariantSwapInstructionData {
    discriminator: [u8; 8],
}

impl InvariantSwapInstructionData {
    pub fn new() -> Self {
        Self {
            discriminator: [187, 193, 40, 121, 47, 73, 144, 177],
        }
    }
}

/// Instruction builder for `InvariantSwap`.
///
/// ### Accounts:
///
///   0. `[]` swap_program
///   1. `[]` state
///   2. `[writable]` pool
///   3. `[writable]` tickmap
///   4. `[writable]` account_x
///   5. `[writable]` account_y
///   6. `[writable]` reserve_x
///   7. `[writable]` reserve_y
///   8. `[]` owner
///   9. `[]` program_authority
///   10. `[optional]` token_program (default to `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`)
#[derive(Default)]
pub struct InvariantSwapBuilder {
    swap_program: Option<solana_program::pubkey::Pubkey>,
    state: Option<solana_program::pubkey::Pubkey>,
    pool: Option<solana_program::pubkey::Pubkey>,
    tickmap: Option<solana_program::pubkey::Pubkey>,
    account_x: Option<solana_program::pubkey::Pubkey>,
    account_y: Option<solana_program::pubkey::Pubkey>,
    reserve_x: Option<solana_program::pubkey::Pubkey>,
    reserve_y: Option<solana_program::pubkey::Pubkey>,
    owner: Option<solana_program::pubkey::Pubkey>,
    program_authority: Option<solana_program::pubkey::Pubkey>,
    token_program: Option<solana_program::pubkey::Pubkey>,
    __remaining_accounts: Vec<solana_program::instruction::AccountMeta>,
}

impl InvariantSwapBuilder {
    pub fn new() -> Self {
        Self::default()
    }
    #[inline(always)]
    pub fn swap_program(&mut self, swap_program: solana_program::pubkey::Pubkey) -> &mut Self {
        self.swap_program = Some(swap_program);
        self
    }
    #[inline(always)]
    pub fn state(&mut self, state: solana_program::pubkey::Pubkey) -> &mut Self {
        self.state = Some(state);
        self
    }
    #[inline(always)]
    pub fn pool(&mut self, pool: solana_program::pubkey::Pubkey) -> &mut Self {
        self.pool = Some(pool);
        self
    }
    #[inline(always)]
    pub fn tickmap(&mut self, tickmap: solana_program::pubkey::Pubkey) -> &mut Self {
        self.tickmap = Some(tickmap);
        self
    }
    #[inline(always)]
    pub fn account_x(&mut self, account_x: solana_program::pubkey::Pubkey) -> &mut Self {
        self.account_x = Some(account_x);
        self
    }
    #[inline(always)]
    pub fn account_y(&mut self, account_y: solana_program::pubkey::Pubkey) -> &mut Self {
        self.account_y = Some(account_y);
        self
    }
    #[inline(always)]
    pub fn reserve_x(&mut self, reserve_x: solana_program::pubkey::Pubkey) -> &mut Self {
        self.reserve_x = Some(reserve_x);
        self
    }
    #[inline(always)]
    pub fn reserve_y(&mut self, reserve_y: solana_program::pubkey::Pubkey) -> &mut Self {
        self.reserve_y = Some(reserve_y);
        self
    }
    #[inline(always)]
    pub fn owner(&mut self, owner: solana_program::pubkey::Pubkey) -> &mut Self {
        self.owner = Some(owner);
        self
    }
    #[inline(always)]
    pub fn program_authority(
        &mut self,
        program_authority: solana_program::pubkey::Pubkey,
    ) -> &mut Self {
        self.program_authority = Some(program_authority);
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
        let accounts = InvariantSwap {
            swap_program: self.swap_program.expect("swap_program is not set"),
            state: self.state.expect("state is not set"),
            pool: self.pool.expect("pool is not set"),
            tickmap: self.tickmap.expect("tickmap is not set"),
            account_x: self.account_x.expect("account_x is not set"),
            account_y: self.account_y.expect("account_y is not set"),
            reserve_x: self.reserve_x.expect("reserve_x is not set"),
            reserve_y: self.reserve_y.expect("reserve_y is not set"),
            owner: self.owner.expect("owner is not set"),
            program_authority: self
                .program_authority
                .expect("program_authority is not set"),
            token_program: self.token_program.unwrap_or(solana_program::pubkey!(
                "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
            )),
        };

        accounts.instruction_with_remaining_accounts(&self.__remaining_accounts)
    }
}

/// `invariant_swap` CPI accounts.
pub struct InvariantSwapCpiAccounts<'a, 'b> {
    pub swap_program: &'b solana_program::account_info::AccountInfo<'a>,

    pub state: &'b solana_program::account_info::AccountInfo<'a>,

    pub pool: &'b solana_program::account_info::AccountInfo<'a>,

    pub tickmap: &'b solana_program::account_info::AccountInfo<'a>,

    pub account_x: &'b solana_program::account_info::AccountInfo<'a>,

    pub account_y: &'b solana_program::account_info::AccountInfo<'a>,

    pub reserve_x: &'b solana_program::account_info::AccountInfo<'a>,

    pub reserve_y: &'b solana_program::account_info::AccountInfo<'a>,

    pub owner: &'b solana_program::account_info::AccountInfo<'a>,

    pub program_authority: &'b solana_program::account_info::AccountInfo<'a>,

    pub token_program: &'b solana_program::account_info::AccountInfo<'a>,
}

/// `invariant_swap` CPI instruction.
pub struct InvariantSwapCpi<'a, 'b> {
    /// The program to invoke.
    pub __program: &'b solana_program::account_info::AccountInfo<'a>,

    pub swap_program: &'b solana_program::account_info::AccountInfo<'a>,

    pub state: &'b solana_program::account_info::AccountInfo<'a>,

    pub pool: &'b solana_program::account_info::AccountInfo<'a>,

    pub tickmap: &'b solana_program::account_info::AccountInfo<'a>,

    pub account_x: &'b solana_program::account_info::AccountInfo<'a>,

    pub account_y: &'b solana_program::account_info::AccountInfo<'a>,

    pub reserve_x: &'b solana_program::account_info::AccountInfo<'a>,

    pub reserve_y: &'b solana_program::account_info::AccountInfo<'a>,

    pub owner: &'b solana_program::account_info::AccountInfo<'a>,

    pub program_authority: &'b solana_program::account_info::AccountInfo<'a>,

    pub token_program: &'b solana_program::account_info::AccountInfo<'a>,
}

impl<'a, 'b> InvariantSwapCpi<'a, 'b> {
    pub fn new(
        program: &'b solana_program::account_info::AccountInfo<'a>,
        accounts: InvariantSwapCpiAccounts<'a, 'b>,
    ) -> Self {
        Self {
            __program: program,
            swap_program: accounts.swap_program,
            state: accounts.state,
            pool: accounts.pool,
            tickmap: accounts.tickmap,
            account_x: accounts.account_x,
            account_y: accounts.account_y,
            reserve_x: accounts.reserve_x,
            reserve_y: accounts.reserve_y,
            owner: accounts.owner,
            program_authority: accounts.program_authority,
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
        let mut accounts = Vec::with_capacity(11 + remaining_accounts.len());
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.swap_program.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.state.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.pool.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.tickmap.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.account_x.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.account_y.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.reserve_x.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.reserve_y.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.owner.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.program_authority.key,
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
        let data = InvariantSwapInstructionData::new().try_to_vec().unwrap();

        let instruction = solana_program::instruction::Instruction {
            program_id: crate::JUPITER_ID,
            accounts,
            data,
        };
        let mut account_infos = Vec::with_capacity(11 + 1 + remaining_accounts.len());
        account_infos.push(self.__program.clone());
        account_infos.push(self.swap_program.clone());
        account_infos.push(self.state.clone());
        account_infos.push(self.pool.clone());
        account_infos.push(self.tickmap.clone());
        account_infos.push(self.account_x.clone());
        account_infos.push(self.account_y.clone());
        account_infos.push(self.reserve_x.clone());
        account_infos.push(self.reserve_y.clone());
        account_infos.push(self.owner.clone());
        account_infos.push(self.program_authority.clone());
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

/// Instruction builder for `InvariantSwap` via CPI.
///
/// ### Accounts:
///
///   0. `[]` swap_program
///   1. `[]` state
///   2. `[writable]` pool
///   3. `[writable]` tickmap
///   4. `[writable]` account_x
///   5. `[writable]` account_y
///   6. `[writable]` reserve_x
///   7. `[writable]` reserve_y
///   8. `[]` owner
///   9. `[]` program_authority
///   10. `[]` token_program
pub struct InvariantSwapCpiBuilder<'a, 'b> {
    instruction: Box<InvariantSwapCpiBuilderInstruction<'a, 'b>>,
}

impl<'a, 'b> InvariantSwapCpiBuilder<'a, 'b> {
    pub fn new(program: &'b solana_program::account_info::AccountInfo<'a>) -> Self {
        let instruction = Box::new(InvariantSwapCpiBuilderInstruction {
            __program: program,
            swap_program: None,
            state: None,
            pool: None,
            tickmap: None,
            account_x: None,
            account_y: None,
            reserve_x: None,
            reserve_y: None,
            owner: None,
            program_authority: None,
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
    pub fn state(&mut self, state: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
        self.instruction.state = Some(state);
        self
    }
    #[inline(always)]
    pub fn pool(&mut self, pool: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
        self.instruction.pool = Some(pool);
        self
    }
    #[inline(always)]
    pub fn tickmap(
        &mut self,
        tickmap: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.tickmap = Some(tickmap);
        self
    }
    #[inline(always)]
    pub fn account_x(
        &mut self,
        account_x: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.account_x = Some(account_x);
        self
    }
    #[inline(always)]
    pub fn account_y(
        &mut self,
        account_y: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.account_y = Some(account_y);
        self
    }
    #[inline(always)]
    pub fn reserve_x(
        &mut self,
        reserve_x: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.reserve_x = Some(reserve_x);
        self
    }
    #[inline(always)]
    pub fn reserve_y(
        &mut self,
        reserve_y: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.reserve_y = Some(reserve_y);
        self
    }
    #[inline(always)]
    pub fn owner(&mut self, owner: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
        self.instruction.owner = Some(owner);
        self
    }
    #[inline(always)]
    pub fn program_authority(
        &mut self,
        program_authority: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.program_authority = Some(program_authority);
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
        let instruction = InvariantSwapCpi {
            __program: self.instruction.__program,

            swap_program: self
                .instruction
                .swap_program
                .expect("swap_program is not set"),

            state: self.instruction.state.expect("state is not set"),

            pool: self.instruction.pool.expect("pool is not set"),

            tickmap: self.instruction.tickmap.expect("tickmap is not set"),

            account_x: self.instruction.account_x.expect("account_x is not set"),

            account_y: self.instruction.account_y.expect("account_y is not set"),

            reserve_x: self.instruction.reserve_x.expect("reserve_x is not set"),

            reserve_y: self.instruction.reserve_y.expect("reserve_y is not set"),

            owner: self.instruction.owner.expect("owner is not set"),

            program_authority: self
                .instruction
                .program_authority
                .expect("program_authority is not set"),

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

struct InvariantSwapCpiBuilderInstruction<'a, 'b> {
    __program: &'b solana_program::account_info::AccountInfo<'a>,
    swap_program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    state: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    pool: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    tickmap: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    account_x: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    account_y: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    reserve_x: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    reserve_y: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    owner: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    program_authority: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    token_program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    /// Additional instruction accounts `(AccountInfo, is_writable, is_signer)`.
    __remaining_accounts: Vec<(
        &'b solana_program::account_info::AccountInfo<'a>,
        bool,
        bool,
    )>,
}
