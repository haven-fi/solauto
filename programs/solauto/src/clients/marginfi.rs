use borsh::BorshDeserialize;
use fixed::types::I80F48;
use fixed_macro::types::I80F48;
use marginfi_sdk::generated::{
    accounts::{Bank, MarginfiAccount},
    instructions::*,
    types::{Balance, OracleSetup},
};
use pyth_sdk_solana::state::SolanaPriceAccount;
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, VerificationLevel};
use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, msg,
    program_error::ProgramError, pubkey::Pubkey, sysvar::Sysvar,
};
use std::{
    cmp::min,
    ops::{Div, Mul, Sub},
};
use switchboard_on_demand::PullFeedAccountData;
use switchboard_v2::AggregatorAccountData;

use crate::{
    state::solauto_position::SolautoPosition,
    types::{
        errors::SolautoError,
        instruction::{
            accounts::{Context, MarginfiOpenPositionAccounts},
            SolautoStandardAccounts,
        },
        lending_protocol::{LendingProtocolClient, LendingProtocolTokenAccounts},
        shared::{
            DeserializedAccount, PriceType, RefreshStateProps, RefreshedTokenState,
            TokenBalanceAmount,
        },
    },
    utils::{math_utils::*, solana_utils::*, solauto_utils::*, validation_utils::*},
};

pub struct MarginfiBankAccounts<'a> {
    pub bank: DeserializedAccount<'a, Bank>,
    pub price_oracle: Option<&'a AccountInfo<'a>>,
    pub vault_authority: Option<&'a AccountInfo<'a>>,
    pub token_accounts: LendingProtocolTokenAccounts<'a>,
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
    pub fn initialize<'c>(
        ctx: &'c Context<'a, MarginfiOpenPositionAccounts<'a>>,
        solauto_position: &'c DeserializedAccount<'a, SolautoPosition>,
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
            let mut marginfi_account_seeds = vec![
                solauto_position.account_info.key.as_ref(),
                ctx.accounts.marginfi_group.key.as_ref(),
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
        supply_tas: LendingProtocolTokenAccounts<'a>,
        supply_vault_authority: Option<&'a AccountInfo<'a>>,
        debt_bank: &'a AccountInfo<'a>,
        debt_price_oracle: Option<&'a AccountInfo<'a>>,
        debt_tas: LendingProtocolTokenAccounts<'a>,
        debt_vault_authority: Option<&'a AccountInfo<'a>>,
    ) -> Result<Self, ProgramError> {
        let supply = MarginfiBankAccounts {
            bank: DeserializedAccount::<Bank>::zerocopy(Some(supply_bank))?.unwrap(),
            price_oracle: supply_price_oracle,
            vault_authority: supply_vault_authority,
            token_accounts: supply_tas,
        };

        let debt = MarginfiBankAccounts {
            bank: DeserializedAccount::<Bank>::zerocopy(Some(debt_bank))?.unwrap(),
            price_oracle: debt_price_oracle,
            vault_authority: debt_vault_authority,
            token_accounts: debt_tas,
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

        let max_ltv = i80f48_to_f64(I80F48::from_le_bytes(
            supply_bank.data.config.asset_weight_init.value,
        ))
        .div(i80f48_to_f64(I80F48::from_le_bytes(
            debt_bank.data.config.liability_weight_init.value,
        )));

        let liq_threshold = i80f48_to_f64(I80F48::from_le_bytes(
            supply_bank.data.config.asset_weight_maint.value,
        ))
        .div(i80f48_to_f64(I80F48::from_le_bytes(
            debt_bank.data.config.liability_weight_maint.value,
        )));

        Ok((max_ltv, liq_threshold))
    }

    pub fn get_supply_token_usage(
        account_balances: &[Balance],
        supply_bank: &'a AccountInfo<'a>,
        price_oracle: &'a AccountInfo<'a>,
        price_type: PriceType,
        mut max_ltv: f64,
    ) -> Result<(RefreshedTokenState, f64), ProgramError> {
        let bank = DeserializedAccount::<Bank>::zerocopy(Some(supply_bank))?.unwrap();

        let asset_share_value = I80F48::from_le_bytes(bank.data.asset_share_value.value);

        let market_price = MarginfiClient::load_price(&bank, price_oracle, price_type)?;

        let supply_shares = MarginfiClient::get_account_balance(account_balances, &bank, true);
        let base_unit_account_deposits = if supply_shares.is_some() {
            i80f48_to_u64(supply_shares.unwrap().mul(asset_share_value))
        } else {
            0
        };

        let total_deposited =
            I80F48::from_le_bytes(bank.data.total_asset_shares.value).mul(asset_share_value);
        let base_unit_deposit_room_available =
            I80F48::from(bank.data.config.deposit_limit).sub(total_deposited);

        let bank_deposits_usd_value =
            from_base_unit::<f64, u8, f64>(i80f48_to_f64(total_deposited), bank.data.mint_decimals)
                .mul(market_price);
        if bank.data.config.total_asset_value_init_limit != 0
            && bank_deposits_usd_value > (bank.data.config.total_asset_value_init_limit as f64)
        {
            let discount_factor =
                (bank.data.config.total_asset_value_init_limit as f64).div(bank_deposits_usd_value);
            max_ltv = max_ltv * discount_factor;
        }

        Ok((
            RefreshedTokenState {
                mint: bank.data.mint,
                decimals: bank.data.mint_decimals,
                amount_used: base_unit_account_deposits,
                amount_can_be_used: i80f48_to_u64(base_unit_deposit_room_available),
                market_price,
                borrow_fee_bps: None,
            },
            max_ltv,
        ))
    }

    pub fn get_debt_token_usage(
        account_balances: &[Balance],
        debt_bank: &'a AccountInfo<'a>,
        price_oracle: &'a AccountInfo<'a>,
        price_type: PriceType,
    ) -> Result<RefreshedTokenState, ProgramError> {
        let bank = DeserializedAccount::<Bank>::zerocopy(Some(debt_bank))?.unwrap();

        let liability_share_value = I80F48::from_le_bytes(bank.data.liability_share_value.value);

        let market_price = MarginfiClient::load_price(&bank, price_oracle, price_type)?;

        let debt_shares = MarginfiClient::get_account_balance(account_balances, &bank, false);
        let base_unit_account_debt = if debt_shares.is_some() {
            i80f48_to_u64(debt_shares.unwrap().mul(liability_share_value))
        } else {
            0
        };

        let total_deposited = I80F48::from_le_bytes(bank.data.total_asset_shares.value)
            .mul(I80F48::from_le_bytes(bank.data.asset_share_value.value));
        let total_borrows = I80F48::from_le_bytes(bank.data.total_liability_shares.value)
            .mul(liability_share_value);
        let base_unit_supply_available = total_deposited.sub(total_borrows);

        let amount_can_be_used = min(
            bank.data
                .config
                .borrow_limit
                .saturating_sub(i80f48_to_u64(total_borrows)),
            i80f48_to_u64(base_unit_supply_available),
        );

        let borrow_fee_bps = i80f48_to_f64(I80F48::from_le_bytes(
            bank.data
                .config
                .interest_rate_config
                .protocol_origination_fee
                .value,
        ))
        .mul(10_000.0)
        .round() as u16;

        Ok(RefreshedTokenState {
            mint: bank.data.mint,
            decimals: bank.data.mint_decimals,
            amount_used: base_unit_account_debt,
            amount_can_be_used,
            market_price,
            borrow_fee_bps: Some(borrow_fee_bps),
        })
    }

    pub fn get_updated_state<'b>(
        marginfi_account: &DeserializedAccount<MarginfiAccount>,
        supply_bank: &'a AccountInfo<'a>,
        supply_price_oracle: &'a AccountInfo<'a>,
        debt_bank: &'a AccountInfo<'a>,
        debt_price_oracle: &'a AccountInfo<'a>,
        price_type: PriceType,
    ) -> Result<RefreshStateProps, ProgramError> {
        let (max_ltv, liq_threshold) =
            MarginfiClient::get_max_ltv_and_liq_threshold(supply_bank, debt_bank)?;

        let account_balances = &marginfi_account.data.lending_account.balances[..2];
        let debt = MarginfiClient::get_debt_token_usage(
            account_balances,
            debt_bank,
            debt_price_oracle,
            price_type,
        )?;

        let (supply, max_ltv) = MarginfiClient::get_supply_token_usage(
            account_balances,
            supply_bank,
            supply_price_oracle,
            price_type,
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
        price_type: PriceType,
    ) -> Result<f64, ProgramError> {
        let clock = Clock::get()?;
        let max_price_age = 120; // Default used by Marginfi is 60

        // We don't need to check confidence intervals, since Marginfi will already throw stale orcale errors
        // when we take actions like withdrawing or borrowing

        match bank.data.config.oracle_setup {
            OracleSetup::None => {
                msg!("Oracle setup set to OracleSetup::None");
                Err(SolautoError::IncorrectAccounts.into())
            }
            OracleSetup::PythLegacy => {
                let price_feed = SolanaPriceAccount::account_info_to_feed(price_oracle)?;

                let price = if price_type == PriceType::Ema {
                    let price_result = price_feed
                        .get_price_no_older_than(clock.unix_timestamp, max_price_age)
                        .unwrap();
                    derive_price(price_result.price, price_result.expo)
                } else {
                    let price_result = price_feed
                        .get_price_no_older_than(clock.unix_timestamp, max_price_age)
                        .unwrap();
                    derive_price(price_result.price, price_result.expo)
                };

                Ok(price)
            }
            OracleSetup::PythPushOracle => {
                let price_feed_data = price_oracle.try_borrow_data()?;
                let price_feed = PriceUpdateV2::deserialize(&mut &price_feed_data.as_ref()[8..])?;

                let price = if price_type == PriceType::Ema {
                    let ema_price = price_feed.price_message.ema_price;
                    let exponent = price_feed.price_message.exponent;
                    derive_price(ema_price, exponent)
                } else {
                    let feed_id = &bank.data.config.oracle_keys[0].to_bytes();
                    let price_result = price_feed
                        .get_price_no_older_than_with_custom_verification_level(
                            &clock,
                            max_price_age,
                            feed_id,
                            VerificationLevel::Full,
                        )
                        .map_err(|e| {
                            msg!("Pyth push oracle error: {:?}", e);
                            ProgramError::Custom(0)
                        })?;
                    derive_price(price_result.price, price_result.exponent)
                };

                Ok(price)
            }
            OracleSetup::SwitchboardLegacy => {
                let data = price_oracle.data.borrow();
                let aggregator_account = AggregatorAccountData::new_from_bytes(&data)?;
                aggregator_account.check_staleness(clock.unix_timestamp, max_price_age as i64)?;
                let sw_decimal = aggregator_account.get_result()?;

                let price = if sw_decimal.scale == 0 {
                    sw_decimal.mantissa as f64
                } else {
                    from_base_unit::<i128, u32, f64>(sw_decimal.mantissa, sw_decimal.scale)
                };

                Ok(price)
            }
            OracleSetup::SwitchboardPull => {
                let data = price_oracle.data.borrow();
                let feed = PullFeedAccountData::parse(data)
                    .map_err(|_| SolautoError::IncorrectAccounts)?;

                let price = I80F48::from_num(feed.result.value)
                    // 10^18
                    .checked_div(I80F48!(1000000000000000000))
                    .unwrap();

                Ok(i80f48_to_f64(price))
            }
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
    fn validate(&self, std_accounts: &Box<SolautoStandardAccounts<'a>>) -> ProgramResult {
        validate_token_accounts(
            &std_accounts.solauto_position,
            self.supply.token_accounts.position_ta,
            self.debt.token_accounts.position_ta,
        )?;
        validate_token_accounts(
            &std_accounts.solauto_position,
            self.supply.token_accounts.authority_ta,
            self.debt.token_accounts.authority_ta,
        )?;
        Ok(())
    }

    fn deposit<'c>(
        &self,
        base_unit_amount: u64,
        std_accounts: &'c Box<SolautoStandardAccounts<'a>>,
    ) -> ProgramResult {
        let authority = get_owner(&std_accounts.solauto_position, self.signer);

        let signer_token_account = if !std_accounts.solauto_position.data.self_managed.val {
            self.supply.token_accounts.position_ta.as_ref().unwrap()
        } else {
            self.supply.token_accounts.authority_ta.as_ref().unwrap()
        };

        let cpi = LendingAccountDepositCpi::new(
            self.program,
            LendingAccountDepositCpiAccounts {
                marginfi_group: self.marginfi_group,
                marginfi_account: self.marginfi_account,
                signer: authority,
                bank: self.supply.bank.account_info,
                signer_token_account,
                bank_liquidity_vault: self.supply.token_accounts.protocol_ta.as_ref().unwrap(),
                token_program: std_accounts.token_program,
            },
            LendingAccountDepositInstructionArgs {
                amount: base_unit_amount,
                deposit_up_to_limit: Some(true)
            },
        );

        if !std_accounts.solauto_position.data.self_managed.val {
            cpi.invoke_signed(&[std_accounts
                .solauto_position
                .data
                .seeds_with_bump()
                .as_slice()])
        } else {
            cpi.invoke()
        }
    }

    fn withdraw<'c>(
        &self,
        amount: TokenBalanceAmount,
        destination: &'a AccountInfo<'a>,
        std_accounts: &'c Box<SolautoStandardAccounts<'a>>,
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
                bank: self.supply.bank.account_info,
                destination_token_account: destination,
                bank_liquidity_vault_authority: self.supply.vault_authority.unwrap(),
                bank_liquidity_vault: self.supply.token_accounts.protocol_ta.as_ref().unwrap(),
                token_program: std_accounts.token_program,
            },
            LendingAccountWithdrawInstructionArgs {
                amount: base_unit_amount,
                withdraw_all: Some(amount == TokenBalanceAmount::All),
            },
        );

        let marginfi_account_data =
            DeserializedAccount::<MarginfiAccount>::zerocopy(Some(self.marginfi_account))?
                .unwrap()
                .data;

        let active_balances = marginfi_account_data
            .lending_account
            .balances
            .iter()
            .filter(|balance| balance.active == 1)
            .collect::<Vec<_>>();

        let mut remaining_accounts = Vec::new();

        let mut withdrawing_all = amount == TokenBalanceAmount::All;
        if !withdrawing_all && active_balances.len() == 1 {
            let asset_shares = I80F48::from_le_bytes(active_balances[0].asset_shares.value);
            let supply_balance = i80f48_to_u64(asset_shares.mul(I80F48::from_le_bytes(
                self.supply.bank.data.asset_share_value.value,
            )));
            let TokenBalanceAmount::Some(withdraw_amount) = amount else {
                panic!("Unexpected amount type");
            };
            withdrawing_all = withdraw_amount >= supply_balance;
        }

        if !withdrawing_all {
            remaining_accounts.push((self.supply.bank.account_info, false, true));
            remaining_accounts.push((self.supply.price_oracle.unwrap(), false, false));
        }

        if active_balances.len() == 2 {
            remaining_accounts.push((self.debt.bank.account_info, false, false));
            remaining_accounts.push((self.debt.price_oracle.unwrap(), false, false));
        }

        if !std_accounts.solauto_position.data.self_managed.val {
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

    fn borrow<'c>(
        &self,
        base_unit_amount: u64,
        destination: &'a AccountInfo<'a>,
        std_accounts: &'c Box<SolautoStandardAccounts<'a>>,
    ) -> ProgramResult {
        let authority = get_owner(&std_accounts.solauto_position, self.signer);

        let cpi = LendingAccountBorrowCpi::new(
            self.program,
            LendingAccountBorrowCpiAccounts {
                marginfi_group: self.marginfi_group,
                marginfi_account: self.marginfi_account,
                signer: authority,
                bank: self.debt.bank.account_info,
                destination_token_account: destination,
                bank_liquidity_vault_authority: self.debt.vault_authority.unwrap(),
                bank_liquidity_vault: self.debt.token_accounts.protocol_ta.as_ref().unwrap(),
                token_program: std_accounts.token_program,
            },
            LendingAccountBorrowInstructionArgs {
                amount: base_unit_amount,
            },
        );

        let mut remaining_accounts = Vec::with_capacity(4);
        remaining_accounts.push((self.supply.bank.account_info, false, false));
        remaining_accounts.push((self.supply.price_oracle.unwrap(), false, false));
        remaining_accounts.push((self.debt.bank.account_info, false, true));
        remaining_accounts.push((self.debt.price_oracle.unwrap(), false, false));

        if !std_accounts.solauto_position.data.self_managed.val {
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

    fn repay<'c>(
        &self,
        amount: TokenBalanceAmount,
        std_accounts: &'c Box<SolautoStandardAccounts<'a>>,
    ) -> ProgramResult {
        let authority = get_owner(&std_accounts.solauto_position, self.signer);

        let base_unit_amount = if let TokenBalanceAmount::Some(num) = amount {
            num
        } else {
            0
        };

        let signer_token_account = if !std_accounts.solauto_position.data.self_managed.val {
            self.debt.token_accounts.position_ta.as_ref().unwrap()
        } else {
            self.debt.token_accounts.authority_ta.as_ref().unwrap()
        };

        let cpi = LendingAccountRepayCpi::new(
            self.program,
            LendingAccountRepayCpiAccounts {
                marginfi_group: self.marginfi_group,
                marginfi_account: self.marginfi_account,
                signer: authority,
                bank: self.debt.bank.account_info,
                signer_token_account: signer_token_account,
                bank_liquidity_vault: self.debt.token_accounts.protocol_ta.as_ref().unwrap(),
                token_program: std_accounts.token_program,
            },
            LendingAccountRepayInstructionArgs {
                amount: base_unit_amount,
                repay_all: Some(amount == TokenBalanceAmount::All),
            },
        );

        if !std_accounts.solauto_position.data.self_managed.val {
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
