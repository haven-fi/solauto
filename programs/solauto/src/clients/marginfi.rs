use marginfi_sdk::generated::{
    accounts::{ Bank, MarginfiAccount },
    instructions::*,
    types::RiskTier,
};
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
};
use fixed::types::I80F48;
use std::ops::{ Mul, Sub };

use crate::{
    types::{
        instruction::{
            accounts::{ Context, MarginfiOpenPositionAccounts },
            SolautoStandardAccounts,
        },
        lending_protocol::{ LendingProtocolClient, LendingProtocolTokenAccounts },
        obligation_position::{ LendingProtocolObligationPosition, PositionTokenUsage },
        shared::{ DeserializedAccount, LendingPlatform, SolautoError, SolautoPosition },
    },
    utils::{ math_utils, solana_utils::*, solauto_utils::*, validation_utils::* },
};

pub struct MarginfiBankAccounts<'a> {
    pub bank: DeserializedAccount<'a, Bank>,
    pub pyth_price_oracle: &'a AccountInfo<'a>,
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
        let supply_bank = DeserializedAccount::<Bank>
            ::deserialize(Some(ctx.accounts.supply_bank))?
            .unwrap();
        if &supply_bank.data.mint != ctx.accounts.supply_mint.key {
            msg!("Supply bank account provided does not match the supply_mint account");
            return Err(SolautoError::IncorrectAccounts.into());
        }

        let (max_ltv, liq_threshold) = MarginfiClient::get_max_ltv_and_liq_threshold(
            &supply_bank.data
        );
        validate_position_settings(solauto_position, max_ltv, liq_threshold)?;

        if account_has_data(ctx.accounts.marginfi_account) {
            return Ok(());
        }

        let marginfi_account_owner = get_owner(solauto_position, ctx.accounts.signer);
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
            let position_seeds = get_solauto_position_seeds(solauto_position);
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
        supply_pyth_price_oracle: Option<&'a AccountInfo<'a>>,
        source_supply_ta: Option<&'a AccountInfo<'a>>,
        vault_supply_ta: Option<&'a AccountInfo<'a>>,
        supply_vault_authority: Option<&'a AccountInfo<'a>>,
        debt_bank: Option<&'a AccountInfo<'a>>,
        debt_pyth_price_oracle: Option<&'a AccountInfo<'a>>,
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
            &deserialized_marginfi_account,
            deserialized_supply_bank.as_ref(),
            deserialized_debt_bank.as_ref()
        )?;

        let supply = if deserialized_supply_bank.is_some() {
            Some(MarginfiBankAccounts {
                bank: deserialized_supply_bank.unwrap(),
                pyth_price_oracle: supply_pyth_price_oracle.unwrap(),
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
                pyth_price_oracle: debt_pyth_price_oracle.unwrap(),
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
            DeserializedAccount::<MarginfiAccount>::deserialize(Some(marginfi_account))?.unwrap(),
            DeserializedAccount::<Bank>::deserialize(supply_bank)?,
            DeserializedAccount::<Bank>::deserialize(debt_bank)?,
        ))
    }

    pub fn get_max_ltv_and_liq_threshold(supply_bank: &Box<Bank>) -> (f64, f64) {
        let value = math_utils::convert_i80f48_to_f64(
            I80F48::from_le_bytes(supply_bank.config.asset_weight_init.value).mul(
                I80F48::from(10000)
            )
        );
        (value, value)
    }

    pub fn get_obligation_position(
        marginfi_account: &DeserializedAccount<MarginfiAccount>,
        supply_bank: Option<&DeserializedAccount<Bank>>,
        debt_bank: Option<&DeserializedAccount<Bank>>
    ) -> Result<LendingProtocolObligationPosition, ProgramError> {
        // Need to also factor into account the total_asset_value_init_limit, as if the total asset value in USD deposited in the bank exceeds this,
        // it modifies the ltv and liq threshold (total_asset_value_init_limit / total_asset_value_deposited_usd) = new max_ltv/liq_threshold
        // min(normal_liq_threshold/normal_max_ltv, new_liq_threshold/new_max_ltv)

        let (max_ltv, liq_threshold) = if supply_bank.is_some() {
            MarginfiClient::get_max_ltv_and_liq_threshold(&supply_bank.unwrap().data)
        } else {
            (0.0, 0.0)
        };

        let balances = &marginfi_account.data.lending_account.balances;

        let get_balance = |bank: &DeserializedAccount<Bank>, is_asset: bool| {
            balances.iter().find_map(|balance| {
                if &balance.bank_pk == bank.account_info.key {
                    let shares = if is_asset {
                        balance.asset_shares.value
                    } else {
                        balance.liability_shares.value
                    };
                    Some(I80F48::from_le_bytes(shares))
                } else {
                    None
                }
            })
        };

        let supply = if let Some(bank) = supply_bank {
            let share_value = I80F48::from_le_bytes(bank.data.asset_share_value.value);
            let supply_balance = get_balance(bank, true);
            let base_unit_amount_used = if supply_balance.is_some() {
                math_utils::convert_i80f48_to_u64(supply_balance.unwrap().mul(share_value))
            } else {
                0
            };

            let total_deposited = I80F48::from_le_bytes(bank.data.total_asset_shares.value).mul(
                share_value
            );
            let base_unit_amount_can_be_used = I80F48::from(bank.data.config.deposit_limit).sub(
                total_deposited
            );

            let market_price = 0.0; // TODO
            Some(
                PositionTokenUsage::from_marginfi_data(
                    base_unit_amount_used,
                    math_utils::convert_i80f48_to_u64(base_unit_amount_can_be_used),
                    market_price,
                    bank.data.mint_decimals
                )
            )
        } else {
            None
        };

        let debt = if let Some(bank) = debt_bank {
            let share_value = I80F48::from_le_bytes(bank.data.liability_share_value.value);
            let total_deposited = I80F48::from_le_bytes(bank.data.total_asset_shares.value).mul(
                I80F48::from_le_bytes(bank.data.asset_share_value.value)
            );
            let bank_borrow_limit = total_deposited.sub(
                I80F48::from_le_bytes(bank.data.total_liability_shares.value).mul(share_value)
            );
            
            // TODO
            None
        } else {
            None
        };

        return Ok(LendingProtocolObligationPosition {
            max_ltv,
            liq_threshold,
            supply,
            debt,
            lending_platform: LendingPlatform::Marginfi,
        });
    }

    pub fn refresh_bank(
        program: &'a AccountInfo<'a>,
        marginfi_group: &'a AccountInfo<'a>,
        bank: &'a AccountInfo<'a>
    ) -> ProgramResult {
        let cpi = LendingPoolAccrueBankInterestCpi::new(
            program,
            LendingPoolAccrueBankInterestCpiAccounts {
                marginfi_group,
                bank,
            }
        );
        cpi.invoke()
    }
}

impl<'a> LendingProtocolClient<'a> for MarginfiClient<'a> {
    fn validate(&self, std_accounts: &SolautoStandardAccounts) -> ProgramResult {
        if !std_accounts.solauto_position.data.self_managed {
            let position = std_accounts.solauto_position.data.position.as_ref().unwrap();

            if
                self.supply.is_some() &&
                self.supply.as_ref().unwrap().bank.data.mint != position.protocol_data.supply_mint
            {
                msg!("Incorrect supply bank provided for the current position");
                return Err(SolautoError::IncorrectAccounts.into());
            }

            if
                self.debt.is_some() &&
                self.debt.as_ref().unwrap().bank.data.mint !=
                    position.protocol_data.debt_mint.unwrap()
            {
                msg!("Incorrect debt bank provided for the current position");
                return Err(SolautoError::IncorrectAccounts.into());
            }
        }

        validate_lending_protocol_account(
            std_accounts.signer,
            &std_accounts.solauto_position,
            self.marginfi_account.account_info
        )?;

        validate_token_accounts(
            std_accounts.signer,
            &std_accounts.solauto_position,
            &self.supply.as_ref().unwrap().token_accounts.source_ta,
            self.debt.as_ref().map_or_else(
                || None,
                |debt| Some(&debt.token_accounts.source_ta)
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
        let authority = get_owner(&std_accounts.solauto_position, self.signer);
        let supply = self.supply.as_ref().unwrap();

        let cpi = LendingAccountDepositCpi::new(
            self.program,
            LendingAccountDepositCpiAccounts {
                marginfi_group: self.marginfi_group,
                marginfi_account: self.marginfi_account.account_info,
                signer: authority,
                bank: supply.bank.account_info,
                signer_token_account: supply.token_accounts.source_ta.account_info,
                bank_liquidity_vault: supply.token_accounts.protocol_ta,
                token_program: std_accounts.token_program,
            },
            LendingAccountDepositInstructionArgs {
                amount: base_unit_amount,
            }
        );

        if authority.key == std_accounts.solauto_position.account_info.key {
            let position_seeds = get_solauto_position_seeds(&std_accounts.solauto_position);
            let transformed: Vec<&[u8]> = position_seeds
                .iter()
                .map(|v| v.as_slice())
                .collect();
            cpi.invoke_signed(&[transformed.as_slice()])
        } else {
            cpi.invoke()
        }
    }

    fn withdraw<'b>(
        &self,
        base_unit_amount: u64,
        destination: &'a AccountInfo<'a>,
        std_accounts: &'b SolautoStandardAccounts<'a>
    ) -> ProgramResult {
        let authority = get_owner(&std_accounts.solauto_position, self.signer);
        let supply = self.supply.as_ref().unwrap();

        let cpi = LendingAccountWithdrawCpi::new(
            self.program,
            LendingAccountWithdrawCpiAccounts {
                marginfi_group: self.marginfi_group,
                marginfi_account: self.marginfi_account.account_info,
                signer: authority,
                bank: supply.bank.account_info,
                destination_token_account: destination,
                bank_liquidity_vault_authority: supply.vault_authority.unwrap(),
                bank_liquidity_vault: supply.token_accounts.protocol_ta,
                token_program: std_accounts.token_program,
            },
            LendingAccountWithdrawInstructionArgs {
                amount: base_unit_amount,
                withdraw_all: Some(false), // TODO
            }
        );

        let mut remaining_accounts = Vec::new();
        remaining_accounts.push((supply.bank.account_info, false, true));
        remaining_accounts.push((supply.pyth_price_oracle, false, false));

        if self.debt.is_some() {
            let debt = self.debt.as_ref().unwrap();
            remaining_accounts.push((debt.bank.account_info, false, false));
            remaining_accounts.push((debt.pyth_price_oracle, false, false));
        }

        if authority.key == std_accounts.solauto_position.account_info.key {
            let position_seeds = get_solauto_position_seeds(&std_accounts.solauto_position);
            let transformed: Vec<&[u8]> = position_seeds
                .iter()
                .map(|v| v.as_slice())
                .collect();
            cpi.invoke_signed_with_remaining_accounts(
                &[transformed.as_slice()],
                remaining_accounts.as_slice()
            )
        } else {
            cpi.invoke_with_remaining_accounts(remaining_accounts.as_slice())
        }
    }

    fn borrow<'b>(
        &self,
        base_unit_amount: u64,
        destination: &'a AccountInfo<'a>,
        std_accounts: &'b SolautoStandardAccounts<'a>
    ) -> ProgramResult {
        let authority = get_owner(&std_accounts.solauto_position, self.signer);
        let supply = self.supply.as_ref().unwrap();
        let debt = self.debt.as_ref().unwrap();

        let cpi = LendingAccountBorrowCpi::new(
            self.program,
            LendingAccountBorrowCpiAccounts {
                marginfi_group: self.marginfi_group,
                marginfi_account: self.marginfi_account.account_info,
                signer: authority,
                bank: debt.bank.account_info,
                destination_token_account: destination,
                bank_liquidity_vault_authority: debt.vault_authority.unwrap(),
                bank_liquidity_vault: debt.token_accounts.protocol_ta,
                token_program: std_accounts.token_program,
            },
            LendingAccountBorrowInstructionArgs {
                amount: base_unit_amount,
            }
        );

        let mut remaining_accounts = Vec::new();
        remaining_accounts.push((supply.bank.account_info, false, false));
        remaining_accounts.push((supply.pyth_price_oracle, false, false));
        remaining_accounts.push((debt.bank.account_info, false, true));
        remaining_accounts.push((debt.pyth_price_oracle, false, false));

        if authority.key == std_accounts.solauto_position.account_info.key {
            let position_seeds = get_solauto_position_seeds(&std_accounts.solauto_position);
            let transformed: Vec<&[u8]> = position_seeds
                .iter()
                .map(|v| v.as_slice())
                .collect();
            cpi.invoke_signed_with_remaining_accounts(
                &[transformed.as_slice()],
                remaining_accounts.as_slice()
            )
        } else {
            cpi.invoke_with_remaining_accounts(remaining_accounts.as_slice())
        }
    }

    fn repay<'b>(
        &self,
        base_unit_amount: u64,
        std_accounts: &'b SolautoStandardAccounts<'a>
    ) -> ProgramResult {
        let authority = get_owner(&std_accounts.solauto_position, self.signer);
        let debt = self.debt.as_ref().unwrap();

        let cpi = LendingAccountRepayCpi::new(
            self.program,
            LendingAccountRepayCpiAccounts {
                marginfi_group: self.marginfi_group,
                marginfi_account: self.marginfi_account.account_info,
                signer: authority,
                bank: debt.bank.account_info,
                signer_token_account: debt.token_accounts.source_ta.account_info,
                bank_liquidity_vault: debt.token_accounts.protocol_ta,
                token_program: std_accounts.token_program,
            },
            LendingAccountRepayInstructionArgs {
                amount: base_unit_amount,
                repay_all: Some(false), // TODO: support this on our side for withdraw and repay
            }
        );

        if authority.key == std_accounts.solauto_position.account_info.key {
            let position_seeds = get_solauto_position_seeds(&std_accounts.solauto_position);
            let transformed: Vec<&[u8]> = position_seeds
                .iter()
                .map(|v| v.as_slice())
                .collect();
            cpi.invoke_signed(&[transformed.as_slice()])
        } else {
            cpi.invoke()
        }
    }
}
