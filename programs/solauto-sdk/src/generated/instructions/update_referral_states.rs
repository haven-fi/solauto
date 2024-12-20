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
pub struct UpdateReferralStates {
    pub signer: solana_program::pubkey::Pubkey,

    pub system_program: solana_program::pubkey::Pubkey,

    pub rent: solana_program::pubkey::Pubkey,

    pub signer_referral_state: solana_program::pubkey::Pubkey,

    pub referred_by_state: Option<solana_program::pubkey::Pubkey>,

    pub referred_by_authority: Option<solana_program::pubkey::Pubkey>,
}

impl UpdateReferralStates {
    pub fn instruction(
        &self,
        args: UpdateReferralStatesInstructionArgs,
    ) -> solana_program::instruction::Instruction {
        self.instruction_with_remaining_accounts(args, &[])
    }
    #[allow(clippy::vec_init_then_push)]
    pub fn instruction_with_remaining_accounts(
        &self,
        args: UpdateReferralStatesInstructionArgs,
        remaining_accounts: &[solana_program::instruction::AccountMeta],
    ) -> solana_program::instruction::Instruction {
        let mut accounts = Vec::with_capacity(6 + remaining_accounts.len());
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.signer,
            true,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.system_program,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.rent, false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.signer_referral_state,
            false,
        ));
        if let Some(referred_by_state) = self.referred_by_state {
            accounts.push(solana_program::instruction::AccountMeta::new(
                referred_by_state,
                false,
            ));
        } else {
            accounts.push(solana_program::instruction::AccountMeta::new_readonly(
                crate::SOLAUTO_ID,
                false,
            ));
        }
        if let Some(referred_by_authority) = self.referred_by_authority {
            accounts.push(solana_program::instruction::AccountMeta::new_readonly(
                referred_by_authority,
                false,
            ));
        } else {
            accounts.push(solana_program::instruction::AccountMeta::new_readonly(
                crate::SOLAUTO_ID,
                false,
            ));
        }
        accounts.extend_from_slice(remaining_accounts);
        let mut data = UpdateReferralStatesInstructionData::new()
            .try_to_vec()
            .unwrap();
        let mut args = args.try_to_vec().unwrap();
        data.append(&mut args);

        solana_program::instruction::Instruction {
            program_id: crate::SOLAUTO_ID,
            accounts,
            data,
        }
    }
}

#[derive(BorshDeserialize, BorshSerialize)]
pub struct UpdateReferralStatesInstructionData {
    discriminator: u8,
}

impl UpdateReferralStatesInstructionData {
    pub fn new() -> Self {
        Self { discriminator: 0 }
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct UpdateReferralStatesInstructionArgs {
    pub referral_fees_dest_mint: Option<Pubkey>,
    pub address_lookup_table: Option<Pubkey>,
}

/// Instruction builder for `UpdateReferralStates`.
///
/// ### Accounts:
///
///   0. `[signer]` signer
///   1. `[optional]` system_program (default to `11111111111111111111111111111111`)
///   2. `[optional]` rent (default to `SysvarRent111111111111111111111111111111111`)
///   3. `[writable]` signer_referral_state
///   4. `[writable, optional]` referred_by_state
///   5. `[optional]` referred_by_authority
#[derive(Default)]
pub struct UpdateReferralStatesBuilder {
    signer: Option<solana_program::pubkey::Pubkey>,
    system_program: Option<solana_program::pubkey::Pubkey>,
    rent: Option<solana_program::pubkey::Pubkey>,
    signer_referral_state: Option<solana_program::pubkey::Pubkey>,
    referred_by_state: Option<solana_program::pubkey::Pubkey>,
    referred_by_authority: Option<solana_program::pubkey::Pubkey>,
    referral_fees_dest_mint: Option<Pubkey>,
    address_lookup_table: Option<Pubkey>,
    __remaining_accounts: Vec<solana_program::instruction::AccountMeta>,
}

impl UpdateReferralStatesBuilder {
    pub fn new() -> Self {
        Self::default()
    }
    #[inline(always)]
    pub fn signer(&mut self, signer: solana_program::pubkey::Pubkey) -> &mut Self {
        self.signer = Some(signer);
        self
    }
    /// `[optional account, default to '11111111111111111111111111111111']`
    #[inline(always)]
    pub fn system_program(&mut self, system_program: solana_program::pubkey::Pubkey) -> &mut Self {
        self.system_program = Some(system_program);
        self
    }
    /// `[optional account, default to 'SysvarRent111111111111111111111111111111111']`
    #[inline(always)]
    pub fn rent(&mut self, rent: solana_program::pubkey::Pubkey) -> &mut Self {
        self.rent = Some(rent);
        self
    }
    #[inline(always)]
    pub fn signer_referral_state(
        &mut self,
        signer_referral_state: solana_program::pubkey::Pubkey,
    ) -> &mut Self {
        self.signer_referral_state = Some(signer_referral_state);
        self
    }
    /// `[optional account]`
    #[inline(always)]
    pub fn referred_by_state(
        &mut self,
        referred_by_state: Option<solana_program::pubkey::Pubkey>,
    ) -> &mut Self {
        self.referred_by_state = referred_by_state;
        self
    }
    /// `[optional account]`
    #[inline(always)]
    pub fn referred_by_authority(
        &mut self,
        referred_by_authority: Option<solana_program::pubkey::Pubkey>,
    ) -> &mut Self {
        self.referred_by_authority = referred_by_authority;
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn referral_fees_dest_mint(&mut self, referral_fees_dest_mint: Pubkey) -> &mut Self {
        self.referral_fees_dest_mint = Some(referral_fees_dest_mint);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn address_lookup_table(&mut self, address_lookup_table: Pubkey) -> &mut Self {
        self.address_lookup_table = Some(address_lookup_table);
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
        let accounts = UpdateReferralStates {
            signer: self.signer.expect("signer is not set"),
            system_program: self
                .system_program
                .unwrap_or(solana_program::pubkey!("11111111111111111111111111111111")),
            rent: self.rent.unwrap_or(solana_program::pubkey!(
                "SysvarRent111111111111111111111111111111111"
            )),
            signer_referral_state: self
                .signer_referral_state
                .expect("signer_referral_state is not set"),
            referred_by_state: self.referred_by_state,
            referred_by_authority: self.referred_by_authority,
        };
        let args = UpdateReferralStatesInstructionArgs {
            referral_fees_dest_mint: self.referral_fees_dest_mint.clone(),
            address_lookup_table: self.address_lookup_table.clone(),
        };

        accounts.instruction_with_remaining_accounts(args, &self.__remaining_accounts)
    }
}

/// `update_referral_states` CPI accounts.
pub struct UpdateReferralStatesCpiAccounts<'a, 'b> {
    pub signer: &'b solana_program::account_info::AccountInfo<'a>,

    pub system_program: &'b solana_program::account_info::AccountInfo<'a>,

    pub rent: &'b solana_program::account_info::AccountInfo<'a>,

    pub signer_referral_state: &'b solana_program::account_info::AccountInfo<'a>,

    pub referred_by_state: Option<&'b solana_program::account_info::AccountInfo<'a>>,

    pub referred_by_authority: Option<&'b solana_program::account_info::AccountInfo<'a>>,
}

/// `update_referral_states` CPI instruction.
pub struct UpdateReferralStatesCpi<'a, 'b> {
    /// The program to invoke.
    pub __program: &'b solana_program::account_info::AccountInfo<'a>,

    pub signer: &'b solana_program::account_info::AccountInfo<'a>,

    pub system_program: &'b solana_program::account_info::AccountInfo<'a>,

    pub rent: &'b solana_program::account_info::AccountInfo<'a>,

    pub signer_referral_state: &'b solana_program::account_info::AccountInfo<'a>,

    pub referred_by_state: Option<&'b solana_program::account_info::AccountInfo<'a>>,

    pub referred_by_authority: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    /// The arguments for the instruction.
    pub __args: UpdateReferralStatesInstructionArgs,
}

impl<'a, 'b> UpdateReferralStatesCpi<'a, 'b> {
    pub fn new(
        program: &'b solana_program::account_info::AccountInfo<'a>,
        accounts: UpdateReferralStatesCpiAccounts<'a, 'b>,
        args: UpdateReferralStatesInstructionArgs,
    ) -> Self {
        Self {
            __program: program,
            signer: accounts.signer,
            system_program: accounts.system_program,
            rent: accounts.rent,
            signer_referral_state: accounts.signer_referral_state,
            referred_by_state: accounts.referred_by_state,
            referred_by_authority: accounts.referred_by_authority,
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
        let mut accounts = Vec::with_capacity(6 + remaining_accounts.len());
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.signer.key,
            true,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.system_program.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.rent.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.signer_referral_state.key,
            false,
        ));
        if let Some(referred_by_state) = self.referred_by_state {
            accounts.push(solana_program::instruction::AccountMeta::new(
                *referred_by_state.key,
                false,
            ));
        } else {
            accounts.push(solana_program::instruction::AccountMeta::new_readonly(
                crate::SOLAUTO_ID,
                false,
            ));
        }
        if let Some(referred_by_authority) = self.referred_by_authority {
            accounts.push(solana_program::instruction::AccountMeta::new_readonly(
                *referred_by_authority.key,
                false,
            ));
        } else {
            accounts.push(solana_program::instruction::AccountMeta::new_readonly(
                crate::SOLAUTO_ID,
                false,
            ));
        }
        remaining_accounts.iter().for_each(|remaining_account| {
            accounts.push(solana_program::instruction::AccountMeta {
                pubkey: *remaining_account.0.key,
                is_signer: remaining_account.1,
                is_writable: remaining_account.2,
            })
        });
        let mut data = UpdateReferralStatesInstructionData::new()
            .try_to_vec()
            .unwrap();
        let mut args = self.__args.try_to_vec().unwrap();
        data.append(&mut args);

        let instruction = solana_program::instruction::Instruction {
            program_id: crate::SOLAUTO_ID,
            accounts,
            data,
        };
        let mut account_infos = Vec::with_capacity(6 + 1 + remaining_accounts.len());
        account_infos.push(self.__program.clone());
        account_infos.push(self.signer.clone());
        account_infos.push(self.system_program.clone());
        account_infos.push(self.rent.clone());
        account_infos.push(self.signer_referral_state.clone());
        if let Some(referred_by_state) = self.referred_by_state {
            account_infos.push(referred_by_state.clone());
        }
        if let Some(referred_by_authority) = self.referred_by_authority {
            account_infos.push(referred_by_authority.clone());
        }
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

/// Instruction builder for `UpdateReferralStates` via CPI.
///
/// ### Accounts:
///
///   0. `[signer]` signer
///   1. `[]` system_program
///   2. `[]` rent
///   3. `[writable]` signer_referral_state
///   4. `[writable, optional]` referred_by_state
///   5. `[optional]` referred_by_authority
pub struct UpdateReferralStatesCpiBuilder<'a, 'b> {
    instruction: Box<UpdateReferralStatesCpiBuilderInstruction<'a, 'b>>,
}

impl<'a, 'b> UpdateReferralStatesCpiBuilder<'a, 'b> {
    pub fn new(program: &'b solana_program::account_info::AccountInfo<'a>) -> Self {
        let instruction = Box::new(UpdateReferralStatesCpiBuilderInstruction {
            __program: program,
            signer: None,
            system_program: None,
            rent: None,
            signer_referral_state: None,
            referred_by_state: None,
            referred_by_authority: None,
            referral_fees_dest_mint: None,
            address_lookup_table: None,
            __remaining_accounts: Vec::new(),
        });
        Self { instruction }
    }
    #[inline(always)]
    pub fn signer(
        &mut self,
        signer: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.signer = Some(signer);
        self
    }
    #[inline(always)]
    pub fn system_program(
        &mut self,
        system_program: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.system_program = Some(system_program);
        self
    }
    #[inline(always)]
    pub fn rent(&mut self, rent: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
        self.instruction.rent = Some(rent);
        self
    }
    #[inline(always)]
    pub fn signer_referral_state(
        &mut self,
        signer_referral_state: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.signer_referral_state = Some(signer_referral_state);
        self
    }
    /// `[optional account]`
    #[inline(always)]
    pub fn referred_by_state(
        &mut self,
        referred_by_state: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    ) -> &mut Self {
        self.instruction.referred_by_state = referred_by_state;
        self
    }
    /// `[optional account]`
    #[inline(always)]
    pub fn referred_by_authority(
        &mut self,
        referred_by_authority: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    ) -> &mut Self {
        self.instruction.referred_by_authority = referred_by_authority;
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn referral_fees_dest_mint(&mut self, referral_fees_dest_mint: Pubkey) -> &mut Self {
        self.instruction.referral_fees_dest_mint = Some(referral_fees_dest_mint);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn address_lookup_table(&mut self, address_lookup_table: Pubkey) -> &mut Self {
        self.instruction.address_lookup_table = Some(address_lookup_table);
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
        let args = UpdateReferralStatesInstructionArgs {
            referral_fees_dest_mint: self.instruction.referral_fees_dest_mint.clone(),
            address_lookup_table: self.instruction.address_lookup_table.clone(),
        };
        let instruction = UpdateReferralStatesCpi {
            __program: self.instruction.__program,

            signer: self.instruction.signer.expect("signer is not set"),

            system_program: self
                .instruction
                .system_program
                .expect("system_program is not set"),

            rent: self.instruction.rent.expect("rent is not set"),

            signer_referral_state: self
                .instruction
                .signer_referral_state
                .expect("signer_referral_state is not set"),

            referred_by_state: self.instruction.referred_by_state,

            referred_by_authority: self.instruction.referred_by_authority,
            __args: args,
        };
        instruction.invoke_signed_with_remaining_accounts(
            signers_seeds,
            &self.instruction.__remaining_accounts,
        )
    }
}

struct UpdateReferralStatesCpiBuilderInstruction<'a, 'b> {
    __program: &'b solana_program::account_info::AccountInfo<'a>,
    signer: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    system_program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    rent: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    signer_referral_state: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    referred_by_state: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    referred_by_authority: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    referral_fees_dest_mint: Option<Pubkey>,
    address_lookup_table: Option<Pubkey>,
    /// Additional instruction accounts `(AccountInfo, is_writable, is_signer)`.
    __remaining_accounts: Vec<(
        &'b solana_program::account_info::AccountInfo<'a>,
        bool,
        bool,
    )>,
}
