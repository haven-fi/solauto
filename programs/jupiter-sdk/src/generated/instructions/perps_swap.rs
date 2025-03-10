//! This code was AUTOGENERATED using the kinobi library.
//! Please DO NOT EDIT THIS FILE, instead use visitors
//! to add features, then rerun kinobi to update it.
//!
//! [https://github.com/metaplex-foundation/kinobi]
//!

use borsh::BorshDeserialize;
use borsh::BorshSerialize;

/// Accounts.
pub struct PerpsSwap {
    pub swap_program: solana_program::pubkey::Pubkey,

    pub owner: solana_program::pubkey::Pubkey,

    pub funding_account: solana_program::pubkey::Pubkey,

    pub receiving_account: solana_program::pubkey::Pubkey,

    pub transfer_authority: solana_program::pubkey::Pubkey,

    pub perpetuals: solana_program::pubkey::Pubkey,

    pub pool: solana_program::pubkey::Pubkey,

    pub receiving_custody: solana_program::pubkey::Pubkey,

    pub receiving_custody_oracle_account: solana_program::pubkey::Pubkey,

    pub receiving_custody_token_account: solana_program::pubkey::Pubkey,

    pub dispensing_custody: solana_program::pubkey::Pubkey,

    pub dispensing_custody_oracle_account: solana_program::pubkey::Pubkey,

    pub dispensing_custody_token_account: solana_program::pubkey::Pubkey,

    pub token_program: solana_program::pubkey::Pubkey,

    pub event_authority: solana_program::pubkey::Pubkey,

    pub program: solana_program::pubkey::Pubkey,
}

impl PerpsSwap {
    pub fn instruction(&self) -> solana_program::instruction::Instruction {
        self.instruction_with_remaining_accounts(&[])
    }
    #[allow(clippy::vec_init_then_push)]
    pub fn instruction_with_remaining_accounts(
        &self,
        remaining_accounts: &[solana_program::instruction::AccountMeta],
    ) -> solana_program::instruction::Instruction {
        let mut accounts = Vec::with_capacity(16 + remaining_accounts.len());
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.swap_program,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.owner, false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.funding_account,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.receiving_account,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.transfer_authority,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.perpetuals,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.pool, false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.receiving_custody,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.receiving_custody_oracle_account,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.receiving_custody_token_account,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.dispensing_custody,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.dispensing_custody_oracle_account,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.dispensing_custody_token_account,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.token_program,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.event_authority,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.program,
            false,
        ));
        accounts.extend_from_slice(remaining_accounts);
        let data = PerpsSwapInstructionData::new().try_to_vec().unwrap();

        solana_program::instruction::Instruction {
            program_id: crate::JUPITER_ID,
            accounts,
            data,
        }
    }
}

#[derive(BorshDeserialize, BorshSerialize)]
pub struct PerpsSwapInstructionData {
    discriminator: [u8; 8],
}

impl PerpsSwapInstructionData {
    pub fn new() -> Self {
        Self {
            discriminator: [147, 22, 108, 178, 110, 18, 171, 34],
        }
    }
}

/// Instruction builder for `PerpsSwap`.
///
/// ### Accounts:
///
///   0. `[]` swap_program
///   1. `[writable]` owner
///   2. `[writable]` funding_account
///   3. `[writable]` receiving_account
///   4. `[]` transfer_authority
///   5. `[]` perpetuals
///   6. `[writable]` pool
///   7. `[writable]` receiving_custody
///   8. `[]` receiving_custody_oracle_account
///   9. `[writable]` receiving_custody_token_account
///   10. `[writable]` dispensing_custody
///   11. `[]` dispensing_custody_oracle_account
///   12. `[writable]` dispensing_custody_token_account
///   13. `[optional]` token_program (default to `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`)
///   14. `[]` event_authority
///   15. `[]` program
#[derive(Default)]
pub struct PerpsSwapBuilder {
    swap_program: Option<solana_program::pubkey::Pubkey>,
    owner: Option<solana_program::pubkey::Pubkey>,
    funding_account: Option<solana_program::pubkey::Pubkey>,
    receiving_account: Option<solana_program::pubkey::Pubkey>,
    transfer_authority: Option<solana_program::pubkey::Pubkey>,
    perpetuals: Option<solana_program::pubkey::Pubkey>,
    pool: Option<solana_program::pubkey::Pubkey>,
    receiving_custody: Option<solana_program::pubkey::Pubkey>,
    receiving_custody_oracle_account: Option<solana_program::pubkey::Pubkey>,
    receiving_custody_token_account: Option<solana_program::pubkey::Pubkey>,
    dispensing_custody: Option<solana_program::pubkey::Pubkey>,
    dispensing_custody_oracle_account: Option<solana_program::pubkey::Pubkey>,
    dispensing_custody_token_account: Option<solana_program::pubkey::Pubkey>,
    token_program: Option<solana_program::pubkey::Pubkey>,
    event_authority: Option<solana_program::pubkey::Pubkey>,
    program: Option<solana_program::pubkey::Pubkey>,
    __remaining_accounts: Vec<solana_program::instruction::AccountMeta>,
}

impl PerpsSwapBuilder {
    pub fn new() -> Self {
        Self::default()
    }
    #[inline(always)]
    pub fn swap_program(&mut self, swap_program: solana_program::pubkey::Pubkey) -> &mut Self {
        self.swap_program = Some(swap_program);
        self
    }
    #[inline(always)]
    pub fn owner(&mut self, owner: solana_program::pubkey::Pubkey) -> &mut Self {
        self.owner = Some(owner);
        self
    }
    #[inline(always)]
    pub fn funding_account(
        &mut self,
        funding_account: solana_program::pubkey::Pubkey,
    ) -> &mut Self {
        self.funding_account = Some(funding_account);
        self
    }
    #[inline(always)]
    pub fn receiving_account(
        &mut self,
        receiving_account: solana_program::pubkey::Pubkey,
    ) -> &mut Self {
        self.receiving_account = Some(receiving_account);
        self
    }
    #[inline(always)]
    pub fn transfer_authority(
        &mut self,
        transfer_authority: solana_program::pubkey::Pubkey,
    ) -> &mut Self {
        self.transfer_authority = Some(transfer_authority);
        self
    }
    #[inline(always)]
    pub fn perpetuals(&mut self, perpetuals: solana_program::pubkey::Pubkey) -> &mut Self {
        self.perpetuals = Some(perpetuals);
        self
    }
    #[inline(always)]
    pub fn pool(&mut self, pool: solana_program::pubkey::Pubkey) -> &mut Self {
        self.pool = Some(pool);
        self
    }
    #[inline(always)]
    pub fn receiving_custody(
        &mut self,
        receiving_custody: solana_program::pubkey::Pubkey,
    ) -> &mut Self {
        self.receiving_custody = Some(receiving_custody);
        self
    }
    #[inline(always)]
    pub fn receiving_custody_oracle_account(
        &mut self,
        receiving_custody_oracle_account: solana_program::pubkey::Pubkey,
    ) -> &mut Self {
        self.receiving_custody_oracle_account = Some(receiving_custody_oracle_account);
        self
    }
    #[inline(always)]
    pub fn receiving_custody_token_account(
        &mut self,
        receiving_custody_token_account: solana_program::pubkey::Pubkey,
    ) -> &mut Self {
        self.receiving_custody_token_account = Some(receiving_custody_token_account);
        self
    }
    #[inline(always)]
    pub fn dispensing_custody(
        &mut self,
        dispensing_custody: solana_program::pubkey::Pubkey,
    ) -> &mut Self {
        self.dispensing_custody = Some(dispensing_custody);
        self
    }
    #[inline(always)]
    pub fn dispensing_custody_oracle_account(
        &mut self,
        dispensing_custody_oracle_account: solana_program::pubkey::Pubkey,
    ) -> &mut Self {
        self.dispensing_custody_oracle_account = Some(dispensing_custody_oracle_account);
        self
    }
    #[inline(always)]
    pub fn dispensing_custody_token_account(
        &mut self,
        dispensing_custody_token_account: solana_program::pubkey::Pubkey,
    ) -> &mut Self {
        self.dispensing_custody_token_account = Some(dispensing_custody_token_account);
        self
    }
    /// `[optional account, default to 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA']`
    #[inline(always)]
    pub fn token_program(&mut self, token_program: solana_program::pubkey::Pubkey) -> &mut Self {
        self.token_program = Some(token_program);
        self
    }
    #[inline(always)]
    pub fn event_authority(
        &mut self,
        event_authority: solana_program::pubkey::Pubkey,
    ) -> &mut Self {
        self.event_authority = Some(event_authority);
        self
    }
    #[inline(always)]
    pub fn program(&mut self, program: solana_program::pubkey::Pubkey) -> &mut Self {
        self.program = Some(program);
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
        let accounts = PerpsSwap {
            swap_program: self.swap_program.expect("swap_program is not set"),
            owner: self.owner.expect("owner is not set"),
            funding_account: self.funding_account.expect("funding_account is not set"),
            receiving_account: self
                .receiving_account
                .expect("receiving_account is not set"),
            transfer_authority: self
                .transfer_authority
                .expect("transfer_authority is not set"),
            perpetuals: self.perpetuals.expect("perpetuals is not set"),
            pool: self.pool.expect("pool is not set"),
            receiving_custody: self
                .receiving_custody
                .expect("receiving_custody is not set"),
            receiving_custody_oracle_account: self
                .receiving_custody_oracle_account
                .expect("receiving_custody_oracle_account is not set"),
            receiving_custody_token_account: self
                .receiving_custody_token_account
                .expect("receiving_custody_token_account is not set"),
            dispensing_custody: self
                .dispensing_custody
                .expect("dispensing_custody is not set"),
            dispensing_custody_oracle_account: self
                .dispensing_custody_oracle_account
                .expect("dispensing_custody_oracle_account is not set"),
            dispensing_custody_token_account: self
                .dispensing_custody_token_account
                .expect("dispensing_custody_token_account is not set"),
            token_program: self.token_program.unwrap_or(solana_program::pubkey!(
                "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
            )),
            event_authority: self.event_authority.expect("event_authority is not set"),
            program: self.program.expect("program is not set"),
        };

        accounts.instruction_with_remaining_accounts(&self.__remaining_accounts)
    }
}

/// `perps_swap` CPI accounts.
pub struct PerpsSwapCpiAccounts<'a, 'b> {
    pub swap_program: &'b solana_program::account_info::AccountInfo<'a>,

    pub owner: &'b solana_program::account_info::AccountInfo<'a>,

    pub funding_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub receiving_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub transfer_authority: &'b solana_program::account_info::AccountInfo<'a>,

    pub perpetuals: &'b solana_program::account_info::AccountInfo<'a>,

    pub pool: &'b solana_program::account_info::AccountInfo<'a>,

    pub receiving_custody: &'b solana_program::account_info::AccountInfo<'a>,

    pub receiving_custody_oracle_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub receiving_custody_token_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub dispensing_custody: &'b solana_program::account_info::AccountInfo<'a>,

    pub dispensing_custody_oracle_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub dispensing_custody_token_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub token_program: &'b solana_program::account_info::AccountInfo<'a>,

    pub event_authority: &'b solana_program::account_info::AccountInfo<'a>,

    pub program: &'b solana_program::account_info::AccountInfo<'a>,
}

/// `perps_swap` CPI instruction.
pub struct PerpsSwapCpi<'a, 'b> {
    /// The program to invoke.
    pub __program: &'b solana_program::account_info::AccountInfo<'a>,

    pub swap_program: &'b solana_program::account_info::AccountInfo<'a>,

    pub owner: &'b solana_program::account_info::AccountInfo<'a>,

    pub funding_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub receiving_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub transfer_authority: &'b solana_program::account_info::AccountInfo<'a>,

    pub perpetuals: &'b solana_program::account_info::AccountInfo<'a>,

    pub pool: &'b solana_program::account_info::AccountInfo<'a>,

    pub receiving_custody: &'b solana_program::account_info::AccountInfo<'a>,

    pub receiving_custody_oracle_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub receiving_custody_token_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub dispensing_custody: &'b solana_program::account_info::AccountInfo<'a>,

    pub dispensing_custody_oracle_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub dispensing_custody_token_account: &'b solana_program::account_info::AccountInfo<'a>,

    pub token_program: &'b solana_program::account_info::AccountInfo<'a>,

    pub event_authority: &'b solana_program::account_info::AccountInfo<'a>,

    pub program: &'b solana_program::account_info::AccountInfo<'a>,
}

impl<'a, 'b> PerpsSwapCpi<'a, 'b> {
    pub fn new(
        program: &'b solana_program::account_info::AccountInfo<'a>,
        accounts: PerpsSwapCpiAccounts<'a, 'b>,
    ) -> Self {
        Self {
            __program: program,
            swap_program: accounts.swap_program,
            owner: accounts.owner,
            funding_account: accounts.funding_account,
            receiving_account: accounts.receiving_account,
            transfer_authority: accounts.transfer_authority,
            perpetuals: accounts.perpetuals,
            pool: accounts.pool,
            receiving_custody: accounts.receiving_custody,
            receiving_custody_oracle_account: accounts.receiving_custody_oracle_account,
            receiving_custody_token_account: accounts.receiving_custody_token_account,
            dispensing_custody: accounts.dispensing_custody,
            dispensing_custody_oracle_account: accounts.dispensing_custody_oracle_account,
            dispensing_custody_token_account: accounts.dispensing_custody_token_account,
            token_program: accounts.token_program,
            event_authority: accounts.event_authority,
            program: accounts.program,
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
        let mut accounts = Vec::with_capacity(16 + remaining_accounts.len());
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.swap_program.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.owner.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.funding_account.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.receiving_account.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.transfer_authority.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.perpetuals.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.pool.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.receiving_custody.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.receiving_custody_oracle_account.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.receiving_custody_token_account.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.dispensing_custody.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.dispensing_custody_oracle_account.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.dispensing_custody_token_account.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.token_program.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.event_authority.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.program.key,
            false,
        ));
        remaining_accounts.iter().for_each(|remaining_account| {
            accounts.push(solana_program::instruction::AccountMeta {
                pubkey: *remaining_account.0.key,
                is_signer: remaining_account.1,
                is_writable: remaining_account.2,
            })
        });
        let data = PerpsSwapInstructionData::new().try_to_vec().unwrap();

        let instruction = solana_program::instruction::Instruction {
            program_id: crate::JUPITER_ID,
            accounts,
            data,
        };
        let mut account_infos = Vec::with_capacity(16 + 1 + remaining_accounts.len());
        account_infos.push(self.__program.clone());
        account_infos.push(self.swap_program.clone());
        account_infos.push(self.owner.clone());
        account_infos.push(self.funding_account.clone());
        account_infos.push(self.receiving_account.clone());
        account_infos.push(self.transfer_authority.clone());
        account_infos.push(self.perpetuals.clone());
        account_infos.push(self.pool.clone());
        account_infos.push(self.receiving_custody.clone());
        account_infos.push(self.receiving_custody_oracle_account.clone());
        account_infos.push(self.receiving_custody_token_account.clone());
        account_infos.push(self.dispensing_custody.clone());
        account_infos.push(self.dispensing_custody_oracle_account.clone());
        account_infos.push(self.dispensing_custody_token_account.clone());
        account_infos.push(self.token_program.clone());
        account_infos.push(self.event_authority.clone());
        account_infos.push(self.program.clone());
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

/// Instruction builder for `PerpsSwap` via CPI.
///
/// ### Accounts:
///
///   0. `[]` swap_program
///   1. `[writable]` owner
///   2. `[writable]` funding_account
///   3. `[writable]` receiving_account
///   4. `[]` transfer_authority
///   5. `[]` perpetuals
///   6. `[writable]` pool
///   7. `[writable]` receiving_custody
///   8. `[]` receiving_custody_oracle_account
///   9. `[writable]` receiving_custody_token_account
///   10. `[writable]` dispensing_custody
///   11. `[]` dispensing_custody_oracle_account
///   12. `[writable]` dispensing_custody_token_account
///   13. `[]` token_program
///   14. `[]` event_authority
///   15. `[]` program
pub struct PerpsSwapCpiBuilder<'a, 'b> {
    instruction: Box<PerpsSwapCpiBuilderInstruction<'a, 'b>>,
}

impl<'a, 'b> PerpsSwapCpiBuilder<'a, 'b> {
    pub fn new(program: &'b solana_program::account_info::AccountInfo<'a>) -> Self {
        let instruction = Box::new(PerpsSwapCpiBuilderInstruction {
            __program: program,
            swap_program: None,
            owner: None,
            funding_account: None,
            receiving_account: None,
            transfer_authority: None,
            perpetuals: None,
            pool: None,
            receiving_custody: None,
            receiving_custody_oracle_account: None,
            receiving_custody_token_account: None,
            dispensing_custody: None,
            dispensing_custody_oracle_account: None,
            dispensing_custody_token_account: None,
            token_program: None,
            event_authority: None,
            program: None,
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
    pub fn owner(&mut self, owner: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
        self.instruction.owner = Some(owner);
        self
    }
    #[inline(always)]
    pub fn funding_account(
        &mut self,
        funding_account: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.funding_account = Some(funding_account);
        self
    }
    #[inline(always)]
    pub fn receiving_account(
        &mut self,
        receiving_account: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.receiving_account = Some(receiving_account);
        self
    }
    #[inline(always)]
    pub fn transfer_authority(
        &mut self,
        transfer_authority: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.transfer_authority = Some(transfer_authority);
        self
    }
    #[inline(always)]
    pub fn perpetuals(
        &mut self,
        perpetuals: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.perpetuals = Some(perpetuals);
        self
    }
    #[inline(always)]
    pub fn pool(&mut self, pool: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
        self.instruction.pool = Some(pool);
        self
    }
    #[inline(always)]
    pub fn receiving_custody(
        &mut self,
        receiving_custody: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.receiving_custody = Some(receiving_custody);
        self
    }
    #[inline(always)]
    pub fn receiving_custody_oracle_account(
        &mut self,
        receiving_custody_oracle_account: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.receiving_custody_oracle_account = Some(receiving_custody_oracle_account);
        self
    }
    #[inline(always)]
    pub fn receiving_custody_token_account(
        &mut self,
        receiving_custody_token_account: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.receiving_custody_token_account = Some(receiving_custody_token_account);
        self
    }
    #[inline(always)]
    pub fn dispensing_custody(
        &mut self,
        dispensing_custody: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.dispensing_custody = Some(dispensing_custody);
        self
    }
    #[inline(always)]
    pub fn dispensing_custody_oracle_account(
        &mut self,
        dispensing_custody_oracle_account: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.dispensing_custody_oracle_account =
            Some(dispensing_custody_oracle_account);
        self
    }
    #[inline(always)]
    pub fn dispensing_custody_token_account(
        &mut self,
        dispensing_custody_token_account: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.dispensing_custody_token_account = Some(dispensing_custody_token_account);
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
    pub fn event_authority(
        &mut self,
        event_authority: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.event_authority = Some(event_authority);
        self
    }
    #[inline(always)]
    pub fn program(
        &mut self,
        program: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.program = Some(program);
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
        let instruction = PerpsSwapCpi {
            __program: self.instruction.__program,

            swap_program: self
                .instruction
                .swap_program
                .expect("swap_program is not set"),

            owner: self.instruction.owner.expect("owner is not set"),

            funding_account: self
                .instruction
                .funding_account
                .expect("funding_account is not set"),

            receiving_account: self
                .instruction
                .receiving_account
                .expect("receiving_account is not set"),

            transfer_authority: self
                .instruction
                .transfer_authority
                .expect("transfer_authority is not set"),

            perpetuals: self.instruction.perpetuals.expect("perpetuals is not set"),

            pool: self.instruction.pool.expect("pool is not set"),

            receiving_custody: self
                .instruction
                .receiving_custody
                .expect("receiving_custody is not set"),

            receiving_custody_oracle_account: self
                .instruction
                .receiving_custody_oracle_account
                .expect("receiving_custody_oracle_account is not set"),

            receiving_custody_token_account: self
                .instruction
                .receiving_custody_token_account
                .expect("receiving_custody_token_account is not set"),

            dispensing_custody: self
                .instruction
                .dispensing_custody
                .expect("dispensing_custody is not set"),

            dispensing_custody_oracle_account: self
                .instruction
                .dispensing_custody_oracle_account
                .expect("dispensing_custody_oracle_account is not set"),

            dispensing_custody_token_account: self
                .instruction
                .dispensing_custody_token_account
                .expect("dispensing_custody_token_account is not set"),

            token_program: self
                .instruction
                .token_program
                .expect("token_program is not set"),

            event_authority: self
                .instruction
                .event_authority
                .expect("event_authority is not set"),

            program: self.instruction.program.expect("program is not set"),
        };
        instruction.invoke_signed_with_remaining_accounts(
            signers_seeds,
            &self.instruction.__remaining_accounts,
        )
    }
}

struct PerpsSwapCpiBuilderInstruction<'a, 'b> {
    __program: &'b solana_program::account_info::AccountInfo<'a>,
    swap_program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    owner: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    funding_account: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    receiving_account: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    transfer_authority: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    perpetuals: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    pool: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    receiving_custody: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    receiving_custody_oracle_account: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    receiving_custody_token_account: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    dispensing_custody: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    dispensing_custody_oracle_account: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    dispensing_custody_token_account: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    token_program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    event_authority: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    /// Additional instruction accounts `(AccountInfo, is_writable, is_signer)`.
    __remaining_accounts: Vec<(
        &'b solana_program::account_info::AccountInfo<'a>,
        bool,
        bool,
    )>,
}
