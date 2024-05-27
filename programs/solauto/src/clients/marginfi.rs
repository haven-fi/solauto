use fixed::types::I80F48;
use marginfi_sdk::generated::{
    accounts::{Bank, MarginfiAccount},
    instructions::*,
    types::Balance,
};
use pyth_sdk_solana::state::SolanaPriceAccount;
use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult,
    program_error::ProgramError, pubkey::Pubkey, sysvar::Sysvar,
};
use std::ops::{Div, Mul, Sub};
use switchboard_v2::AggregatorAccountData;

use crate::{
    types::{
        instruction::{
            accounts::{Context, MarginfiOpenPositionAccounts},
            SolautoStandardAccounts,
        },
        lending_protocol::{LendingProtocolClient, LendingProtocolTokenAccounts},
        shared::{
            DeserializedAccount, LendingPlatform, RefreshStateProps, RefreshedTokenData,
            SolautoError, TokenBalanceAmount,
        },
        solauto_position::SolautoPosition,
    },
    utils::{math_utils, solana_utils::*, solauto_utils::*, validation_utils::*},
};

pub struct MarginfiBankAccounts<'a> {
    pub bank: &'a AccountInfo<'a>,
    pub price_oracle: Option<&'a AccountInfo<'a>>,
    pub vault_authority: Option<&'a AccountInfo<'a>>,
    pub token_accounts: Option<LendingProtocolTokenAccounts<'a>>,
}

pub struct MarginfiClient<'a> {
    signer: &'a AccountInfo<'a>,
    program: &'a AccountInfo<'a>,
    marginfi_account: &'a AccountInfo<'a>,
    marginfi_group: &'a AccountInfo<'a>,
    supply: MarginfiBankAccounts<'a>,
    debt: MarginfiBankAccounts<'a>,
}

impl<'a> MarginfiClient<'a> {
    pub fn initialize<'b>(
        ctx: &'b Context<'a, MarginfiOpenPositionAccounts<'a>>,
        solauto_position: &'b DeserializedAccount<'a, SolautoPosition>,
        marignfi_acc_seed_idx: Option<u64>,
    ) -> ProgramResult {
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
            },
        );
        if marginfi_account_owner.key == solauto_position.account_info.key {
            let seed_idx_bytes = marignfi_acc_seed_idx.unwrap().to_le_bytes();
            let mut marginfi_account_seeds = vec![
                solauto_position.account_info.key.as_ref(),
                seed_idx_bytes.as_ref(),
            ];
            let (_, bump) =
                Pubkey::find_program_address(marginfi_account_seeds.as_slice(), &crate::ID);
            let binding = [bump];
            marginfi_account_seeds.push(&binding);

            cpi.invoke_signed(&[
                solauto_position.data.seeds_with_bump().as_slice(),
                marginfi_account_seeds.as_slice(),
            ])
        } else {
            cpi.invoke()
        }
    }

    pub fn from(
        signer: &'a AccountInfo<'a>,
        program: &'a AccountInfo<'a>,
        marginfi_group: &'a AccountInfo<'a>,
        marginfi_account: &'a AccountInfo<'a>,
        supply_bank: &'a AccountInfo<'a>,
        supply_price_oracle: Option<&'a AccountInfo<'a>>,
        source_supply_ta: Option<&'a AccountInfo<'a>>,
        vault_supply_ta: Option<&'a AccountInfo<'a>>,
        supply_vault_authority: Option<&'a AccountInfo<'a>>,
        debt_bank: &'a AccountInfo<'a>,
        debt_price_oracle: Option<&'a AccountInfo<'a>>,
        source_debt_ta: Option<&'a AccountInfo<'a>>,
        vault_debt_ta: Option<&'a AccountInfo<'a>>,
        debt_vault_authority: Option<&'a AccountInfo<'a>>,
    ) -> Result<Self, ProgramError> {
        let supply = MarginfiBankAccounts {
            bank: supply_bank,
            price_oracle: supply_price_oracle,
            vault_authority: supply_vault_authority,
            token_accounts: LendingProtocolTokenAccounts::from(
                None,
                source_supply_ta,
                vault_supply_ta,
            )?,
        };

        let debt = MarginfiBankAccounts {
            bank: debt_bank,
            price_oracle: debt_price_oracle,
            vault_authority: debt_vault_authority,
            token_accounts: LendingProtocolTokenAccounts::from(
                None,
                source_debt_ta,
                vault_debt_ta,
            )?,
        };

        Ok(Self {
            signer,
            program,
            marginfi_account,
            marginfi_group,
            supply,
            debt,
        })
    }

    fn get_account_balance(
        account_balances: &[Balance],
        bank: &DeserializedAccount<Bank>,
        is_supply: bool,
    ) -> Option<I80F48> {
        account_balances.iter().find_map(|balance| {
            if &balance.bank_pk == bank.account_info.key {
                let shares = if is_supply {
                    balance.asset_shares.value
                } else {
                    balance.liability_shares.value
                };
                Some(I80F48::from_le_bytes(shares))
            } else {
                None
            }
        })
    }

    pub fn get_max_ltv_and_liq_threshold(
        supply_bank: &'a AccountInfo<'a>,
        debt_bank: &'a AccountInfo<'a>,
    ) -> Result<(f64, f64), ProgramError> {
        let supply_bank = DeserializedAccount::<Bank>::zerocopy(Some(supply_bank))?.unwrap();
        let debt_bank = DeserializedAccount::<Bank>::zerocopy(Some(debt_bank))?.unwrap();

        let max_ltv = math_utils::convert_i80f48_to_f64(I80F48::from_le_bytes(
            supply_bank.data.config.asset_weight_init.value,
        ))
        .div(math_utils::convert_i80f48_to_f64(I80F48::from_le_bytes(
            debt_bank.data.config.liability_weight_maint.value,
        )));

        let liq_threshold = math_utils::convert_i80f48_to_f64(I80F48::from_le_bytes(
            supply_bank.data.config.asset_weight_maint.value,
        ))
        .div(math_utils::convert_i80f48_to_f64(I80F48::from_le_bytes(
            debt_bank.data.config.liability_weight_maint.value,
        )));

        Ok((max_ltv, liq_threshold))
    }

    pub fn get_supply_token_usage(
        account_balances: &[Balance],
        supply_bank: &'a AccountInfo<'a>,
        price_oracle: &'a AccountInfo<'a>,
        mut max_ltv: f64,
    ) -> Result<(RefreshedTokenData, f64), ProgramError> {
        let bank = DeserializedAccount::<Bank>::zerocopy(Some(supply_bank))?.unwrap();

        let asset_share_value = I80F48::from_le_bytes(bank.data.asset_share_value.value);

        let market_price = MarginfiClient::load_price(&bank, price_oracle)?;

        let supply_balance = MarginfiClient::get_account_balance(account_balances, &bank, true);
        let base_unit_account_deposits = if supply_balance.is_some() {
            math_utils::convert_i80f48_to_u64(supply_balance.unwrap().mul(asset_share_value))
        } else {
            0
        };

        let total_deposited =
            I80F48::from_le_bytes(bank.data.total_asset_shares.value).mul(asset_share_value);
        let base_unit_deposit_room_available =
            I80F48::from(bank.data.config.deposit_limit).sub(total_deposited);

        let bank_deposits_usd_value = math_utils::from_base_unit::<f64, u8, f64>(
            math_utils::convert_i80f48_to_f64(total_deposited),
            bank.data.mint_decimals,
        )
        .mul(market_price);
        if bank.data.config.total_asset_value_init_limit != 0
            && bank_deposits_usd_value > (bank.data.config.total_asset_value_init_limit as f64)
        {
            let discount_factor =
                bank_deposits_usd_value.div(bank.data.config.total_asset_value_init_limit as f64);
            max_ltv = max_ltv * discount_factor;
        }

        Ok((
            RefreshedTokenData {
                amount_used: base_unit_account_deposits,
                amount_can_be_used: math_utils::convert_i80f48_to_u64(
                    base_unit_deposit_room_available,
                ),
                market_price,
                decimals: bank.data.mint_decimals,
                borrow_fee_bps: None,
            },
            max_ltv,
        ))
    }

    pub fn get_debt_token_usage(
        account_balances: &[Balance],
        debt_bank: &'a AccountInfo<'a>,
        price_oracle: &'a AccountInfo<'a>,
    ) -> Result<RefreshedTokenData, ProgramError> {
        let bank = DeserializedAccount::<Bank>::zerocopy(Some(debt_bank))?.unwrap();

        let liability_share_value = I80F48::from_le_bytes(bank.data.liability_share_value.value);

        let market_price = MarginfiClient::load_price(&bank, price_oracle)?;

        let debt_balance = MarginfiClient::get_account_balance(account_balances, &bank, false);
        let base_unit_account_debt = if debt_balance.is_some() {
            math_utils::convert_i80f48_to_u64(debt_balance.unwrap().mul(liability_share_value))
        } else {
            0
        };

        let total_deposited = I80F48::from_le_bytes(bank.data.total_asset_shares.value)
            .mul(I80F48::from_le_bytes(bank.data.asset_share_value.value));
        let base_unit_debt_available = total_deposited.sub(
            I80F48::from_le_bytes(bank.data.total_liability_shares.value)
                .mul(liability_share_value),
        );

        Ok(RefreshedTokenData {
            amount_used: base_unit_account_debt,
            amount_can_be_used: math_utils::convert_i80f48_to_u64(base_unit_debt_available),
            market_price,
            decimals: bank.data.mint_decimals,
            borrow_fee_bps: None,
        })
    }

    pub fn get_updated_state(
        marginfi_account: &DeserializedAccount<MarginfiAccount>,
        supply_bank: &'a AccountInfo<'a>,
        supply_price_oracle: &'a AccountInfo<'a>,
        debt_bank: &'a AccountInfo<'a>,
        debt_price_oracle: &'a AccountInfo<'a>,
    ) -> Result<RefreshStateProps, ProgramError> {
        let (max_ltv, liq_threshold) =
            MarginfiClient::get_max_ltv_and_liq_threshold(supply_bank, debt_bank)?;

        let account_balances = &marginfi_account.data.lending_account.balances[..2];
        let debt =
            MarginfiClient::get_debt_token_usage(account_balances, debt_bank, debt_price_oracle)?;

        let (supply, max_ltv) = MarginfiClient::get_supply_token_usage(
            account_balances,
            supply_bank,
            supply_price_oracle,
            max_ltv,
        )?;

        Ok(RefreshStateProps {
            max_ltv,
            liq_threshold,
            supply,
            debt,
        })
    }

    pub fn load_price(
        bank: &DeserializedAccount<Bank>,
        price_oracle: &AccountInfo,
    ) -> Result<f64, ProgramError> {
        let clock = Clock::get()?;
        let max_price_age = 90; // Default used by Marginfi is 60

        // We don't need to check confidence intervals, since Marginfi will already throw stale orcale errors
        // when we take actions like withdrawing or borrowing

        match bank.data.config.oracle_setup {
            0 => Err(SolautoError::IncorrectAccounts.into()),
            1 => {
                let price_feed = SolanaPriceAccount::account_info_to_feed(price_oracle)?;
                let price_result = price_feed
                    .get_ema_price_no_older_than(clock.unix_timestamp, max_price_age)
                    .unwrap();

                let price = if price_result.expo == 0 {
                    price_result.price as f64
                } else if price_result.expo < 0 {
                    math_utils::from_base_unit::<i64, u32, f64>(
                        price_result.price,
                        price_result.expo.unsigned_abs(),
                    )
                } else {
                    math_utils::to_base_unit::<i64, u32, f64>(
                        price_result.price,
                        price_result.expo.unsigned_abs(),
                    )
                };

                Ok(price)
            }
            2 => {
                let data = price_oracle.data.borrow();
                let aggregator_account = AggregatorAccountData::new_from_bytes(&data)?;
                aggregator_account.check_staleness(clock.unix_timestamp, max_price_age as i64)?;
                let sw_decimal = aggregator_account.get_result()?;

                let price = if sw_decimal.scale == 0 {
                    sw_decimal.mantissa as f64
                } else {
                    math_utils::from_base_unit::<i128, u32, f64>(
                        sw_decimal.mantissa,
                        sw_decimal.scale,
                    )
                };

                Ok(price)
            }
            _ => Ok(0.0),
        }
    }

    pub fn refresh_bank(
        program: &'a AccountInfo<'a>,
        marginfi_group: &'a AccountInfo<'a>,
        bank: &'a AccountInfo<'a>,
    ) -> ProgramResult {
        let cpi = LendingPoolAccrueBankInterestCpi::new(
            program,
            LendingPoolAccrueBankInterestCpiAccounts {
                marginfi_group,
                bank,
            },
        );
        cpi.invoke()
    }
}

impl<'a> LendingProtocolClient<'a> for MarginfiClient<'a> {
    fn validate(&self, std_accounts: &SolautoStandardAccounts) -> ProgramResult {
        validate_lending_program_accounts_with_position(
            LendingPlatform::Marginfi,
            &std_accounts.solauto_position,
            self.marginfi_account,
            Some(self.supply.bank),
            Some(self.debt.bank),
        )?;

        validate_token_accounts(
            std_accounts.signer,
            &std_accounts.solauto_position,
            self.supply
                .token_accounts
                .as_ref()
                .map_or_else(|| None, |tas| Some(&tas.source_ta)),
            self.debt
                .token_accounts
                .as_ref()
                .map_or_else(|| None, |debt| Some(&debt.source_ta)),
        )?;

        Ok(())
    }

    fn deposit<'b>(
        &self,
        base_unit_amount: u64,
        std_accounts: &'b SolautoStandardAccounts<'a>,
    ) -> ProgramResult {
        let authority = get_owner(&std_accounts.solauto_position, self.signer);

        let cpi = LendingAccountDepositCpi::new(
            self.program,
            LendingAccountDepositCpiAccounts {
                marginfi_group: self.marginfi_group,
                marginfi_account: self.marginfi_account,
                signer: authority,
                bank: self.supply.bank,
                signer_token_account: self
                    .supply
                    .token_accounts
                    .as_ref()
                    .unwrap()
                    .source_ta
                    .account_info,
                bank_liquidity_vault: self.supply.token_accounts.as_ref().unwrap().protocol_ta,
                token_program: std_accounts.token_program,
            },
            LendingAccountDepositInstructionArgs {
                amount: base_unit_amount,
            },
        );

        if authority.key == std_accounts.solauto_position.account_info.key {
            cpi.invoke_signed(&[std_accounts
                .solauto_position
                .data
                .seeds_with_bump()
                .as_slice()])
        } else {
            cpi.invoke()
        }
    }

    fn withdraw<'b>(
        &self,
        amount: TokenBalanceAmount,
        destination: &'a AccountInfo<'a>,
        std_accounts: &'b SolautoStandardAccounts<'a>,
    ) -> ProgramResult {
        let authority = get_owner(&std_accounts.solauto_position, self.signer);

        let base_unit_amount = if let TokenBalanceAmount::Some(num) = amount {
            num
        } else {
            0
        };

        let cpi = LendingAccountWithdrawCpi::new(
            self.program,
            LendingAccountWithdrawCpiAccounts {
                marginfi_group: self.marginfi_group,
                marginfi_account: self.marginfi_account,
                signer: authority,
                bank: self.supply.bank,
                destination_token_account: destination,
                bank_liquidity_vault_authority: self.supply.vault_authority.unwrap(),
                bank_liquidity_vault: self.supply.token_accounts.as_ref().unwrap().protocol_ta,
                token_program: std_accounts.token_program,
            },
            LendingAccountWithdrawInstructionArgs {
                amount: base_unit_amount,
                withdraw_all: Some(amount == TokenBalanceAmount::All),
            },
        );

        let mut remaining_accounts = Vec::new();
        remaining_accounts.push((self.supply.bank, false, true));
        remaining_accounts.push((self.supply.price_oracle.unwrap(), false, false));
        remaining_accounts.push((self.debt.bank, false, false));
        remaining_accounts.push((self.debt.price_oracle.unwrap(), false, false));

        if authority.key == std_accounts.solauto_position.account_info.key {
            cpi.invoke_signed_with_remaining_accounts(
                &[std_accounts
                    .solauto_position
                    .data
                    .seeds_with_bump()
                    .as_slice()],
                remaining_accounts.as_slice(),
            )
        } else {
            cpi.invoke_with_remaining_accounts(remaining_accounts.as_slice())
        }
    }

    fn borrow<'b>(
        &self,
        base_unit_amount: u64,
        destination: &'a AccountInfo<'a>,
        std_accounts: &'b SolautoStandardAccounts<'a>,
    ) -> ProgramResult {
        let authority = get_owner(&std_accounts.solauto_position, self.signer);

        let cpi = LendingAccountBorrowCpi::new(
            self.program,
            LendingAccountBorrowCpiAccounts {
                marginfi_group: self.marginfi_group,
                marginfi_account: self.marginfi_account,
                signer: authority,
                bank: self.debt.bank,
                destination_token_account: destination,
                bank_liquidity_vault_authority: self.debt.vault_authority.unwrap(),
                bank_liquidity_vault: self.debt.token_accounts.as_ref().unwrap().protocol_ta,
                token_program: std_accounts.token_program,
            },
            LendingAccountBorrowInstructionArgs {
                amount: base_unit_amount,
            },
        );

        let mut remaining_accounts = Vec::new();
        remaining_accounts.push((self.supply.bank, false, false));
        remaining_accounts.push((self.supply.price_oracle.unwrap(), false, false));
        remaining_accounts.push((self.debt.bank, false, true));
        remaining_accounts.push((self.debt.price_oracle.unwrap(), false, false));

        if authority.key == std_accounts.solauto_position.account_info.key {
            cpi.invoke_signed_with_remaining_accounts(
                &[std_accounts
                    .solauto_position
                    .data
                    .seeds_with_bump()
                    .as_slice()],
                remaining_accounts.as_slice(),
            )
        } else {
            cpi.invoke_with_remaining_accounts(remaining_accounts.as_slice())
        }
    }

    fn repay<'b>(
        &self,
        amount: TokenBalanceAmount,
        std_accounts: &'b SolautoStandardAccounts<'a>,
    ) -> ProgramResult {
        let authority = get_owner(&std_accounts.solauto_position, self.signer);

        let base_unit_amount = if let TokenBalanceAmount::Some(num) = amount {
            num
        } else {
            0
        };

        let cpi = LendingAccountRepayCpi::new(
            self.program,
            LendingAccountRepayCpiAccounts {
                marginfi_group: self.marginfi_group,
                marginfi_account: self.marginfi_account,
                signer: authority,
                bank: self.debt.bank,
                signer_token_account: self
                    .debt
                    .token_accounts
                    .as_ref()
                    .unwrap()
                    .source_ta
                    .account_info,
                bank_liquidity_vault: self.debt.token_accounts.as_ref().unwrap().protocol_ta,
                token_program: std_accounts.token_program,
            },
            LendingAccountRepayInstructionArgs {
                amount: base_unit_amount,
                repay_all: Some(amount == TokenBalanceAmount::All),
            },
        );

        if authority.key == std_accounts.solauto_position.account_info.key {
            cpi.invoke_signed(&[std_accounts
                .solauto_position
                .data
                .seeds_with_bump()
                .as_slice()])
        } else {
            cpi.invoke()
        }
    }
}
