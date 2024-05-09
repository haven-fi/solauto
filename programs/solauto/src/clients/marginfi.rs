use marginfi_sdk::generated::{
    accounts::{ Bank, MarginfiAccount },
    instructions::{
        MarginfiAccountInitializeCpi,
        MarginfiAccountInitializeCpiAccounts,
    },
    types::RiskTier,
};
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
};

use crate::{
    types::{
        instruction::{
            accounts::{ Context, MarginfiOpenPositionAccounts },
            SolautoStandardAccounts,
        },
        lending_protocol::{ LendingProtocolClient, LendingProtocolTokenAccounts },
        obligation_position::LendingProtocolObligationPosition,
        shared::{ DeserializedAccount, SolautoError, SolautoPosition },
    },
    utils::{ solana_utils, solauto_utils, validation_utils::* },
};

pub struct MarginfiBankAccounts<'a> {
    pub bank: DeserializedAccount<'a, Bank>,
    pub vault_authority: Option<&'a AccountInfo<'a>>,
    pub token_accounts: LendingProtocolTokenAccounts<'a>,
}

pub struct MarginfiClient<'a> {
    signer: &'a AccountInfo<'a>,
    program: &'a AccountInfo<'a>,
    marginfi_account: DeserializedAccount<'a, MarginfiAccount>,
    marginfi_group: &'a AccountInfo<'a>,
    supply: Option<MarginfiBankAccounts<'a>>,
    debt: Option<MarginfiBankAccounts<'a>>,
}

impl<'a> MarginfiClient<'a> {
    pub fn initialize<'b>(
        ctx: &'b Context<'a, MarginfiOpenPositionAccounts<'a>>,
        solauto_position: &'b DeserializedAccount<'a, SolautoPosition>
    ) -> ProgramResult {
        // validate_position_settings(solauto_position.as_ref().unwrap().data.setting_params, max_ltv, liq_threshold)

        if solana_utils::account_has_data(ctx.accounts.marginfi_account) {
            return Ok(());
        }

        let marginfi_account_owner = solauto_utils::get_owner(
            solauto_position,
            ctx.accounts.signer
        );
        let cpi = MarginfiAccountInitializeCpi::new(
            ctx.accounts.marginfi_program,
            MarginfiAccountInitializeCpiAccounts {
                marginfi_group: ctx.accounts.marginfi_group,
                marginfi_account: ctx.accounts.marginfi_account,
                authority: marginfi_account_owner,
                fee_payer: ctx.accounts.signer,
                system_program: ctx.accounts.system_program,
            }
        );
        if marginfi_account_owner.key == solauto_position.account_info.key {
            let position_seeds = solauto_utils::get_solauto_position_seeds(solauto_position);
            let transformed: Vec<&[u8]> = position_seeds
                .iter()
                .map(|v| v.as_slice())
                .collect();
            cpi.invoke_signed(&[transformed.as_slice()])
        } else {
            cpi.invoke()
        }
    }

    pub fn from(
        signer: &'a AccountInfo<'a>,
        program: &'a AccountInfo<'a>,
        marginfi_group: &'a AccountInfo<'a>,
        marginfi_account: &'a AccountInfo<'a>,
        supply_bank: Option<&'a AccountInfo<'a>>,
        source_supply_ta: Option<&'a AccountInfo<'a>>,
        vault_supply_ta: Option<&'a AccountInfo<'a>>,
        supply_vault_authority: Option<&'a AccountInfo<'a>>,
        debt_bank: Option<&'a AccountInfo<'a>>,
        source_debt_ta: Option<&'a AccountInfo<'a>>,
        vault_debt_ta: Option<&'a AccountInfo<'a>>,
        debt_vault_authority: Option<&'a AccountInfo<'a>>
    ) -> Result<(Self, LendingProtocolObligationPosition), ProgramError> {
        let (deserialized_marginfi_account, deserialized_supply_bank, deserialized_debt_bank) =
            MarginfiClient::deserialize_margfinfi_accounts(
                marginfi_account,
                supply_bank,
                debt_bank
            )?;

        let obligation_position = MarginfiClient::get_obligation_position(
            &deserialized_marginfi_account.data,
            deserialized_supply_bank.as_ref().map_or_else(
                || None,
                |bank| Some(&bank.data)
            ),
            deserialized_debt_bank.as_ref().map_or_else(
                || None,
                |bank| Some(&bank.data)
            )
        )?;

        let supply = if deserialized_supply_bank.is_some() {
            Some(MarginfiBankAccounts {
                bank: deserialized_supply_bank.unwrap(),
                vault_authority: supply_vault_authority,
                token_accounts: LendingProtocolTokenAccounts::from(
                    None,
                    source_supply_ta,
                    vault_supply_ta
                )?.unwrap(),
            })
        } else {
            None
        };

        let debt = if deserialized_debt_bank.is_some() {
            Some(MarginfiBankAccounts {
                bank: deserialized_debt_bank.unwrap(),
                vault_authority: debt_vault_authority,
                token_accounts: LendingProtocolTokenAccounts::from(
                    None,
                    source_debt_ta,
                    vault_debt_ta
                )?.unwrap(),
            })
        } else {
            None
        };

        let client = Self {
            signer,
            program,
            marginfi_account: deserialized_marginfi_account,
            marginfi_group,
            supply,
            debt,
        };

        return Ok((client, obligation_position));
    }

    pub fn deserialize_margfinfi_accounts(
        marginfi_account: &'a AccountInfo<'a>,
        supply_bank: Option<&'a AccountInfo<'a>>,
        debt_bank: Option<&'a AccountInfo<'a>>
    ) -> Result<
        (
            DeserializedAccount<'a, MarginfiAccount>,
            Option<DeserializedAccount<'a, Bank>>,
            Option<DeserializedAccount<'a, Bank>>,
        ),
        ProgramError
    > {
        Ok((
            DeserializedAccount::<MarginfiAccount>
                ::anchor_deserialize(Some(marginfi_account))?
                .unwrap(),
            DeserializedAccount::<Bank>::anchor_deserialize(supply_bank)?,
            DeserializedAccount::<Bank>::anchor_deserialize(debt_bank)?,
        ))
    }

    pub fn get_max_ltv_and_liq_threshold(&self, supply_bank: &Box<Bank>) -> (f64, f64) {
        // TODO
        (0.0, 0.0)
    }

    pub fn get_obligation_position(
        marginfi_account: &Box<MarginfiAccount>,
        supply_bank: Option<&Box<Bank>>,
        debt_bank: Option<&Box<Bank>>
    ) -> Result<LendingProtocolObligationPosition, ProgramError> {
        // TODO
        return Err(ProgramError::Custom(0));
    }
}

impl<'a> LendingProtocolClient<'a> for MarginfiClient<'a> {
    fn validate(&self, std_accounts: &SolautoStandardAccounts) -> ProgramResult {
        validate_lending_protocol_accounts(
            std_accounts.signer,
            &std_accounts.solauto_position,
            self.marginfi_account.account_info,
            self.supply.as_ref().unwrap().token_accounts.source_ta.account_info,
            self.debt.as_ref().map_or_else(
                || None,
                |debt| Some(debt.token_accounts.protocol_ta)
            )
        )?;

        if
            self.supply.is_some() &&
            self.debt.is_some() &&
            self.supply.as_ref().unwrap().bank.data.config.risk_tier == RiskTier::Isolated
        {
            msg!("Cannot use an isolated asset as collateral");
            return Err(SolautoError::IncorrectAccounts.into());
        }

        Ok(())
    }

    fn deposit<'b>(
        &self,
        base_unit_amount: u64,
        std_accounts: &'b SolautoStandardAccounts<'a>
    ) -> ProgramResult {
        let supply = self.supply.as_ref().unwrap();
        // TODO
        Ok(())
    }

    fn withdraw<'b>(
        &self,
        base_unit_amount: u64,
        destination: &'a AccountInfo<'a>,
        std_accounts: &'b SolautoStandardAccounts<'a>
    ) -> ProgramResult {
        // TODO
        // add 4 remaining accounts: supply bank, supply pyth price oracle, (if marginfi account has debt position): debt bank, debt pyth price oracle
        Ok(())
    }

    fn borrow<'b>(
        &self,
        base_unit_amount: u64,
        destination: &'a AccountInfo<'a>,
        std_accounts: &'b SolautoStandardAccounts<'a>
    ) -> ProgramResult {
        // TODO
        // add 4 remaining accounts: supply bank, supply pyth price oracle, (if marginfi account has debt position): debt bank, debt pyth price oracle
        Ok(())
    }

    fn repay<'b>(
        &self,
        base_unit_amount: u64,
        std_accounts: &'b SolautoStandardAccounts<'a>
    ) -> ProgramResult {
        // TODO
        Ok(())
    }
}
