//! This code was AUTOGENERATED using the kinobi library.
//! Please DO NOT EDIT THIS FILE, instead use visitors
//! to add features, then rerun kinobi to update it.
//!
//! [https://github.com/metaplex-foundation/kinobi]
//!

use crate::generated::types::BankOperationalState;
use crate::generated::types::InterestRateConfigOpt;
use crate::generated::types::OracleConfig;
use crate::generated::types::RiskTier;
use crate::generated::types::WrappedI80F48;
use borsh::BorshDeserialize;
use borsh::BorshSerialize;

/// Accounts.
pub struct LendingPoolConfigureBank {
    pub marginfi_group: solana_program::pubkey::Pubkey,

    pub admin: solana_program::pubkey::Pubkey,

    pub bank: solana_program::pubkey::Pubkey,
}

impl LendingPoolConfigureBank {
    pub fn instruction(
        &self,
        args: LendingPoolConfigureBankInstructionArgs,
    ) -> solana_program::instruction::Instruction {
        self.instruction_with_remaining_accounts(args, &[])
    }
    #[allow(clippy::vec_init_then_push)]
    pub fn instruction_with_remaining_accounts(
        &self,
        args: LendingPoolConfigureBankInstructionArgs,
        remaining_accounts: &[solana_program::instruction::AccountMeta],
    ) -> solana_program::instruction::Instruction {
        let mut accounts = Vec::with_capacity(3 + remaining_accounts.len());
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.marginfi_group,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.admin, true,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.bank, false,
        ));
        accounts.extend_from_slice(remaining_accounts);
        let mut data = LendingPoolConfigureBankInstructionData::new()
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
pub struct LendingPoolConfigureBankInstructionData {
    discriminator: [u8; 8],
}

impl LendingPoolConfigureBankInstructionData {
    pub fn new() -> Self {
        Self {
            discriminator: [121, 173, 156, 40, 93, 148, 56, 237],
        }
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct LendingPoolConfigureBankInstructionArgs {
    pub asset_weight_init: Option<WrappedI80F48>,
    pub asset_weight_maint: Option<WrappedI80F48>,
    pub liability_weight_init: Option<WrappedI80F48>,
    pub liability_weight_maint: Option<WrappedI80F48>,
    pub deposit_limit: Option<u64>,
    pub borrow_limit: Option<u64>,
    pub operational_state: Option<BankOperationalState>,
    pub oracle: Option<OracleConfig>,
    pub interest_rate_config: Option<InterestRateConfigOpt>,
    pub risk_tier: Option<RiskTier>,
    pub total_asset_value_init_limit: Option<u64>,
}

/// Instruction builder for `LendingPoolConfigureBank`.
///
/// ### Accounts:
///
///   0. `[]` marginfi_group
///   1. `[signer]` admin
///   2. `[writable]` bank
#[derive(Default)]
pub struct LendingPoolConfigureBankBuilder {
    marginfi_group: Option<solana_program::pubkey::Pubkey>,
    admin: Option<solana_program::pubkey::Pubkey>,
    bank: Option<solana_program::pubkey::Pubkey>,
    asset_weight_init: Option<WrappedI80F48>,
    asset_weight_maint: Option<WrappedI80F48>,
    liability_weight_init: Option<WrappedI80F48>,
    liability_weight_maint: Option<WrappedI80F48>,
    deposit_limit: Option<u64>,
    borrow_limit: Option<u64>,
    operational_state: Option<BankOperationalState>,
    oracle: Option<OracleConfig>,
    interest_rate_config: Option<InterestRateConfigOpt>,
    risk_tier: Option<RiskTier>,
    total_asset_value_init_limit: Option<u64>,
    __remaining_accounts: Vec<solana_program::instruction::AccountMeta>,
}

impl LendingPoolConfigureBankBuilder {
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
    #[inline(always)]
    pub fn bank(&mut self, bank: solana_program::pubkey::Pubkey) -> &mut Self {
        self.bank = Some(bank);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn asset_weight_init(&mut self, asset_weight_init: WrappedI80F48) -> &mut Self {
        self.asset_weight_init = Some(asset_weight_init);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn asset_weight_maint(&mut self, asset_weight_maint: WrappedI80F48) -> &mut Self {
        self.asset_weight_maint = Some(asset_weight_maint);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn liability_weight_init(&mut self, liability_weight_init: WrappedI80F48) -> &mut Self {
        self.liability_weight_init = Some(liability_weight_init);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn liability_weight_maint(&mut self, liability_weight_maint: WrappedI80F48) -> &mut Self {
        self.liability_weight_maint = Some(liability_weight_maint);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn deposit_limit(&mut self, deposit_limit: u64) -> &mut Self {
        self.deposit_limit = Some(deposit_limit);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn borrow_limit(&mut self, borrow_limit: u64) -> &mut Self {
        self.borrow_limit = Some(borrow_limit);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn operational_state(&mut self, operational_state: BankOperationalState) -> &mut Self {
        self.operational_state = Some(operational_state);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn oracle(&mut self, oracle: OracleConfig) -> &mut Self {
        self.oracle = Some(oracle);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn interest_rate_config(
        &mut self,
        interest_rate_config: InterestRateConfigOpt,
    ) -> &mut Self {
        self.interest_rate_config = Some(interest_rate_config);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn risk_tier(&mut self, risk_tier: RiskTier) -> &mut Self {
        self.risk_tier = Some(risk_tier);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn total_asset_value_init_limit(&mut self, total_asset_value_init_limit: u64) -> &mut Self {
        self.total_asset_value_init_limit = Some(total_asset_value_init_limit);
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
        let accounts = LendingPoolConfigureBank {
            marginfi_group: self.marginfi_group.expect("marginfi_group is not set"),
            admin: self.admin.expect("admin is not set"),
            bank: self.bank.expect("bank is not set"),
        };
        let args = LendingPoolConfigureBankInstructionArgs {
            asset_weight_init: self.asset_weight_init.clone(),
            asset_weight_maint: self.asset_weight_maint.clone(),
            liability_weight_init: self.liability_weight_init.clone(),
            liability_weight_maint: self.liability_weight_maint.clone(),
            deposit_limit: self.deposit_limit.clone(),
            borrow_limit: self.borrow_limit.clone(),
            operational_state: self.operational_state.clone(),
            oracle: self.oracle.clone(),
            interest_rate_config: self.interest_rate_config.clone(),
            risk_tier: self.risk_tier.clone(),
            total_asset_value_init_limit: self.total_asset_value_init_limit.clone(),
        };

        accounts.instruction_with_remaining_accounts(args, &self.__remaining_accounts)
    }
}

/// `lending_pool_configure_bank` CPI accounts.
pub struct LendingPoolConfigureBankCpiAccounts<'a, 'b> {
    pub marginfi_group: &'b solana_program::account_info::AccountInfo<'a>,

    pub admin: &'b solana_program::account_info::AccountInfo<'a>,

    pub bank: &'b solana_program::account_info::AccountInfo<'a>,
}

/// `lending_pool_configure_bank` CPI instruction.
pub struct LendingPoolConfigureBankCpi<'a, 'b> {
    /// The program to invoke.
    pub __program: &'b solana_program::account_info::AccountInfo<'a>,

    pub marginfi_group: &'b solana_program::account_info::AccountInfo<'a>,

    pub admin: &'b solana_program::account_info::AccountInfo<'a>,

    pub bank: &'b solana_program::account_info::AccountInfo<'a>,
    /// The arguments for the instruction.
    pub __args: LendingPoolConfigureBankInstructionArgs,
}

impl<'a, 'b> LendingPoolConfigureBankCpi<'a, 'b> {
    pub fn new(
        program: &'b solana_program::account_info::AccountInfo<'a>,
        accounts: LendingPoolConfigureBankCpiAccounts<'a, 'b>,
        args: LendingPoolConfigureBankInstructionArgs,
    ) -> Self {
        Self {
            __program: program,
            marginfi_group: accounts.marginfi_group,
            admin: accounts.admin,
            bank: accounts.bank,
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
        let mut accounts = Vec::with_capacity(3 + remaining_accounts.len());
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.marginfi_group.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.admin.key,
            true,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.bank.key,
            false,
        ));
        remaining_accounts.iter().for_each(|remaining_account| {
            accounts.push(solana_program::instruction::AccountMeta {
                pubkey: *remaining_account.0.key,
                is_signer: remaining_account.1,
                is_writable: remaining_account.2,
            })
        });
        let mut data = LendingPoolConfigureBankInstructionData::new()
            .try_to_vec()
            .unwrap();
        let mut args = self.__args.try_to_vec().unwrap();
        data.append(&mut args);

        let instruction = solana_program::instruction::Instruction {
            program_id: crate::MARGINFI_ID,
            accounts,
            data,
        };
        let mut account_infos = Vec::with_capacity(3 + 1 + remaining_accounts.len());
        account_infos.push(self.__program.clone());
        account_infos.push(self.marginfi_group.clone());
        account_infos.push(self.admin.clone());
        account_infos.push(self.bank.clone());
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

/// Instruction builder for `LendingPoolConfigureBank` via CPI.
///
/// ### Accounts:
///
///   0. `[]` marginfi_group
///   1. `[signer]` admin
///   2. `[writable]` bank
pub struct LendingPoolConfigureBankCpiBuilder<'a, 'b> {
    instruction: Box<LendingPoolConfigureBankCpiBuilderInstruction<'a, 'b>>,
}

impl<'a, 'b> LendingPoolConfigureBankCpiBuilder<'a, 'b> {
    pub fn new(program: &'b solana_program::account_info::AccountInfo<'a>) -> Self {
        let instruction = Box::new(LendingPoolConfigureBankCpiBuilderInstruction {
            __program: program,
            marginfi_group: None,
            admin: None,
            bank: None,
            asset_weight_init: None,
            asset_weight_maint: None,
            liability_weight_init: None,
            liability_weight_maint: None,
            deposit_limit: None,
            borrow_limit: None,
            operational_state: None,
            oracle: None,
            interest_rate_config: None,
            risk_tier: None,
            total_asset_value_init_limit: None,
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
    #[inline(always)]
    pub fn bank(&mut self, bank: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
        self.instruction.bank = Some(bank);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn asset_weight_init(&mut self, asset_weight_init: WrappedI80F48) -> &mut Self {
        self.instruction.asset_weight_init = Some(asset_weight_init);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn asset_weight_maint(&mut self, asset_weight_maint: WrappedI80F48) -> &mut Self {
        self.instruction.asset_weight_maint = Some(asset_weight_maint);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn liability_weight_init(&mut self, liability_weight_init: WrappedI80F48) -> &mut Self {
        self.instruction.liability_weight_init = Some(liability_weight_init);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn liability_weight_maint(&mut self, liability_weight_maint: WrappedI80F48) -> &mut Self {
        self.instruction.liability_weight_maint = Some(liability_weight_maint);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn deposit_limit(&mut self, deposit_limit: u64) -> &mut Self {
        self.instruction.deposit_limit = Some(deposit_limit);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn borrow_limit(&mut self, borrow_limit: u64) -> &mut Self {
        self.instruction.borrow_limit = Some(borrow_limit);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn operational_state(&mut self, operational_state: BankOperationalState) -> &mut Self {
        self.instruction.operational_state = Some(operational_state);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn oracle(&mut self, oracle: OracleConfig) -> &mut Self {
        self.instruction.oracle = Some(oracle);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn interest_rate_config(
        &mut self,
        interest_rate_config: InterestRateConfigOpt,
    ) -> &mut Self {
        self.instruction.interest_rate_config = Some(interest_rate_config);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn risk_tier(&mut self, risk_tier: RiskTier) -> &mut Self {
        self.instruction.risk_tier = Some(risk_tier);
        self
    }
    /// `[optional argument]`
    #[inline(always)]
    pub fn total_asset_value_init_limit(&mut self, total_asset_value_init_limit: u64) -> &mut Self {
        self.instruction.total_asset_value_init_limit = Some(total_asset_value_init_limit);
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
        let args = LendingPoolConfigureBankInstructionArgs {
            asset_weight_init: self.instruction.asset_weight_init.clone(),
            asset_weight_maint: self.instruction.asset_weight_maint.clone(),
            liability_weight_init: self.instruction.liability_weight_init.clone(),
            liability_weight_maint: self.instruction.liability_weight_maint.clone(),
            deposit_limit: self.instruction.deposit_limit.clone(),
            borrow_limit: self.instruction.borrow_limit.clone(),
            operational_state: self.instruction.operational_state.clone(),
            oracle: self.instruction.oracle.clone(),
            interest_rate_config: self.instruction.interest_rate_config.clone(),
            risk_tier: self.instruction.risk_tier.clone(),
            total_asset_value_init_limit: self.instruction.total_asset_value_init_limit.clone(),
        };
        let instruction = LendingPoolConfigureBankCpi {
            __program: self.instruction.__program,

            marginfi_group: self
                .instruction
                .marginfi_group
                .expect("marginfi_group is not set"),

            admin: self.instruction.admin.expect("admin is not set"),

            bank: self.instruction.bank.expect("bank is not set"),
            __args: args,
        };
        instruction.invoke_signed_with_remaining_accounts(
            signers_seeds,
            &self.instruction.__remaining_accounts,
        )
    }
}

struct LendingPoolConfigureBankCpiBuilderInstruction<'a, 'b> {
    __program: &'b solana_program::account_info::AccountInfo<'a>,
    marginfi_group: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    admin: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    bank: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    asset_weight_init: Option<WrappedI80F48>,
    asset_weight_maint: Option<WrappedI80F48>,
    liability_weight_init: Option<WrappedI80F48>,
    liability_weight_maint: Option<WrappedI80F48>,
    deposit_limit: Option<u64>,
    borrow_limit: Option<u64>,
    operational_state: Option<BankOperationalState>,
    oracle: Option<OracleConfig>,
    interest_rate_config: Option<InterestRateConfigOpt>,
    risk_tier: Option<RiskTier>,
    total_asset_value_init_limit: Option<u64>,
    /// Additional instruction accounts `(AccountInfo, is_writable, is_signer)`.
    __remaining_accounts: Vec<(
        &'b solana_program::account_info::AccountInfo<'a>,
        bool,
        bool,
    )>,
}
