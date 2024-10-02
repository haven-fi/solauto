use std::ops::{ Div, Mul };

use marginfi_sdk::{ generated::accounts::{ Bank, MarginfiAccount }, MARGINFI_ID };
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    system_program::ID as system_program_id,
    sysvar::{ instructions::ID as ixs_sysvar_id, rent::ID as rent_program_id },
};
use spl_associated_token_account::{ get_associated_token_address, ID as ata_program_id };
use spl_token::{ state::Account as TokenAccount, ID as token_program_id };

use crate::{
    constants::{
        KAMINO_PROGRAM,
        MAX_BASIS_POINTS,
        MIN_BOOST_GAP_BPS,
        MIN_REPAY_GAP_BPS,
        SOLAUTO_FEES_WALLET,
        SOLAUTO_MANAGER,
    },
    state::{
        referral_state::ReferralState,
        solauto_position::{ AutomationSettings, PositionData, SolautoPosition },
    },
    types::{
        instruction::SolautoStandardAccounts,
        shared::{ DeserializedAccount, LendingPlatform, SolautoError, TokenType },
    },
};

use super::{
    math_utils::{
        from_base_unit,
        get_max_boost_to_bps,
        get_max_repay_from_bps,
        get_max_repay_to_bps,
    },
    solana_utils::account_has_data,
    solauto_utils,
};

pub fn generic_instruction_validation(
    accounts: &Box<SolautoStandardAccounts>,
    lending_platform: LendingPlatform,
    authority_signer_only_ix: bool,
    solauto_managed_only_ix: bool
) -> ProgramResult {
    validate_instruction(
        accounts.signer,
        &accounts.solauto_position,
        authority_signer_only_ix,
        solauto_managed_only_ix
    )?;
    validate_lending_program_account(accounts.lending_protocol, lending_platform)?;
    validate_sysvar_accounts(
        Some(accounts.system_program),
        Some(accounts.token_program),
        accounts.ata_program,
        accounts.rent,
        accounts.ixs_sysvar
    )?;

    if accounts.authority_referral_state.is_some() {
        validate_referral_accounts(
            &accounts.solauto_position.data.authority,
            accounts.authority_referral_state.as_ref().unwrap(),
            accounts.referred_by_state,
            solauto_utils::safe_unpack_token_account(accounts.referred_by_supply_ta)?.as_ref(),
            true
        )?;
    }

    if
        accounts.solauto_fees_supply_ta.is_some() &&
        !token_account_owned_by(
            solauto_utils
                ::safe_unpack_token_account(accounts.solauto_fees_supply_ta)?
                .as_ref()
                .unwrap(),
            &SOLAUTO_FEES_WALLET
        )
    {
        msg!("Provided incorrect Solauto fees supply TA");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    Ok(())
}

pub fn validate_instruction(
    signer: &AccountInfo,
    solauto_position: &DeserializedAccount<SolautoPosition>,
    authority_signer_only_ix: bool,
    solauto_managed_only_ix: bool
) -> ProgramResult {
    if !signer.is_signer {
        msg!("Signer account is not a signer");
        return Err(ProgramError::MissingRequiredSignature.into());
    }

    let position_authority = solauto_position.data.authority;
    let authority_signed = || {
        let expected_solauto_position_address = Pubkey::create_program_address(
            solauto_position.data.seeds_with_bump().as_slice(),
            &crate::ID
        ).expect("Ok");
        let expected_address_matches =
            solauto_position.account_info.key == &expected_solauto_position_address;
        return signer.key == &position_authority && expected_address_matches;
    };

    if authority_signer_only_ix && !authority_signed() {
        msg!(
            "Authority-only instruction, invalid signer for the specified instruction & Solauto position"
        );
        return Err(ProgramError::MissingRequiredSignature.into());
    } else if !authority_signed() && signer.key != &SOLAUTO_MANAGER {
        msg!("Solauto instruction can only be signed by the position authority or Solauto manager");
        return Err(ProgramError::MissingRequiredSignature.into());
    }

    if solauto_managed_only_ix && solauto_position.data.self_managed.val {
        msg!("Cannot perform the desired instruction on a self-managed position");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    if solauto_position.data.self_managed.val && signer.key == &SOLAUTO_MANAGER {
        msg!("Solauto manager cannot sign an instruction on a self-managed position");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    Ok(())
}

pub fn validate_position_settings(
    solauto_position: &SolautoPosition,
    current_unix_timestamp: u64
) -> ProgramResult {
    let invalid_params = |error_msg| {
        msg!(error_msg);
        Err(SolautoError::InvalidPositionSettings.into())
    };

    let data = &solauto_position.position;
    if data.setting_params.repay_to_bps < data.setting_params.boost_to_bps {
        return invalid_params("repay_to_bps value must be greater than boost_to_bps value");
    }
    let max_boost_to = get_max_boost_to_bps(
        solauto_position.state.max_ltv_bps,
        solauto_position.state.liq_threshold_bps
    );
    if data.setting_params.boost_to_bps > max_boost_to {
        return invalid_params(format!("Exceeds the maximum boost-to of {}", max_boost_to).as_str());
    }
    if data.setting_params.repay_to_bps < data.setting_params.target_boost_to_bps {
        return invalid_params("repay_to_bps value must be greater than target_boost_to_bps value");
    }

    if data.setting_params.repay_gap < MIN_REPAY_GAP_BPS {
        return invalid_params(
            format!("repay_gap must be {} or greater", MIN_REPAY_GAP_BPS).as_str()
        );
    }
    if data.setting_params.boost_gap < MIN_BOOST_GAP_BPS {
        return invalid_params(
            format!("boost_gap must be {} or greater", MIN_BOOST_GAP_BPS).as_str()
        );
    }

    if data.setting_params.automation.is_active() {
        validate_automation_settings(&data.setting_params.automation, current_unix_timestamp)?;
    }

    if data.setting_params.target_boost_to_bps > MAX_BASIS_POINTS {
        return invalid_params(
            format!("target_boost_to_bps must be less than {}", MAX_BASIS_POINTS).as_str()
        );
    }

    let max_repay_to_bps = get_max_repay_to_bps(
        solauto_position.state.max_ltv_bps,
        solauto_position.state.liq_threshold_bps
    );
    if data.setting_params.repay_to_bps > max_repay_to_bps {
        return invalid_params(
            format!("For the given max_ltv and liq_threshold of the supplied asset, repay_to_bps must be lower or equal to {} in order to bring the utilization rate to an allowed position", max_repay_to_bps).as_str()
        );
    }
    let max_repay_from_bps = get_max_repay_from_bps(
        solauto_position.state.max_ltv_bps,
        solauto_position.state.liq_threshold_bps
    );
    if data.setting_params.repay_from_bps() > max_repay_from_bps {
        return invalid_params(
            format!("repay_to_bps + repay_gap must be equal-to or below {}", max_repay_from_bps).as_str()
        );
    }

    Ok(())
}

pub fn validate_dca_settings(
    position: &PositionData,
    current_unix_timestamp: u64
) -> ProgramResult {
    if position.dca.is_active() {
        return Ok(());
    }

    validate_automation_settings(&position.dca.automation, current_unix_timestamp)
}

pub fn validate_automation_settings(
    automation: &AutomationSettings,
    current_unix_timestamp: u64
) -> ProgramResult {
    let invalid_params = |error_msg| {
        msg!(error_msg);
        Err(SolautoError::InvalidAutomationData.into())
    };

    if !automation.is_active() {
        return Ok(());
    }

    if automation.interval_seconds < 60 * 10 || automation.interval_seconds > 60 * 60 * 24 * 30 {
        return invalid_params("Interval period must be between 10 minutes and 1 month");
    }

    if
        current_unix_timestamp < automation.unix_start_date ||
        current_unix_timestamp > automation.unix_start_date + automation.interval_seconds
    {
        return invalid_params("Provided an invalid unix start date");
    }

    if automation.target_periods == 0 {
        return invalid_params("Target periods must be greater than 0");
    }

    Ok(())
}

pub fn validate_lending_program_account(
    program: &AccountInfo,
    lending_platform: LendingPlatform
) -> ProgramResult {
    match lending_platform {
        LendingPlatform::Marginfi => {
            if *program.key != MARGINFI_ID {
                msg!("Incorrect Marginfi program account");
                return Err(ProgramError::IncorrectProgramId.into());
            }
        }
        LendingPlatform::Kamino => {
            if *program.key != KAMINO_PROGRAM {
                msg!("Incorrect Kamino program account");
                return Err(ProgramError::IncorrectProgramId.into());
            }
        }
    }
    // We don't need to check more than this, as lending protocols have their own account checks and will fail during CPI if there is an issue with the provided accounts
    Ok(())
}

pub fn validate_sysvar_accounts(
    system_program: Option<&AccountInfo>,
    token_program: Option<&AccountInfo>,
    ata_program: Option<&AccountInfo>,
    rent: Option<&AccountInfo>,
    ixs_sysvar: Option<&AccountInfo>
) -> ProgramResult {
    if system_program.is_some() && system_program.unwrap().key != &system_program_id {
        msg!("Incorrect system program account provided");
        return Err(SolautoError::IncorrectAccounts.into());
    }
    if token_program.is_some() && token_program.unwrap().key != &token_program_id {
        msg!("Incorrect token program account provided");
        return Err(SolautoError::IncorrectAccounts.into());
    }
    if ata_program.is_some() && ata_program.unwrap().key != &ata_program_id {
        msg!("Incorrect ata program account provided");
        return Err(SolautoError::IncorrectAccounts.into());
    }
    if rent.is_some() && rent.unwrap().key != &rent_program_id {
        msg!("Incorrect rent program account provided");
        return Err(SolautoError::IncorrectAccounts.into());
    }
    if ixs_sysvar.is_some() && ixs_sysvar.unwrap().key != &ixs_sysvar_id {
        msg!("Incorrect ixs sysvar program account provided");
        return Err(SolautoError::IncorrectAccounts.into());
    }
    Ok(())
}

pub fn validate_referral_accounts(
    referral_state_authority: &Pubkey,
    authority_referral_state: &DeserializedAccount<ReferralState>,
    referred_by_state: Option<&AccountInfo>,
    referred_by_supply_ta: Option<&DeserializedAccount<TokenAccount>>,
    check_supply_ta: bool
) -> ProgramResult {
    let referral_state_pda = Pubkey::create_program_address(
        authority_referral_state.data.seeds_with_bump().as_slice(),
        &crate::ID
    )?;
    if
        &authority_referral_state.data.authority != referral_state_authority ||
        &referral_state_pda != authority_referral_state.account_info.key
    {
        msg!("Invalid referral state account given for the provided authority");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    let authority_referred_by_state = &authority_referral_state.data.referred_by_state;

    if
        referred_by_state.is_some() &&
        referred_by_state.as_ref().unwrap().key != authority_referred_by_state
    {
        msg!("Provided incorrect referred_by_state account given the authority referral state");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    if
        check_supply_ta &&
        authority_referred_by_state != &Pubkey::default() &&
        (referred_by_supply_ta.is_none() ||
            !token_account_owned_by(
                referred_by_supply_ta.as_ref().unwrap(),
                authority_referred_by_state
            ))
    {
        msg!(
            "Provided incorrect referred_by_supply_ta according to the given authority and token mint"
        );
        return Err(SolautoError::IncorrectAccounts.into());
    }

    Ok(())
}

pub fn validate_marginfi_bank<'a>(
    marginfi_bank: &'a AccountInfo<'a>,
    mint: &Pubkey
) -> ProgramResult {
    if mint == &Pubkey::default() {
        return Ok(());
    }

    let bank = DeserializedAccount::<Bank>::zerocopy(Some(marginfi_bank))?.unwrap();
    if &bank.data.mint != mint {
        msg!("Provided incorrect bank account");
        return Err(SolautoError::IncorrectAccounts.into());
    }
    Ok(())
}

pub fn validate_lending_program_accounts_with_position<'a>(
    lending_platform: LendingPlatform,
    solauto_position: &DeserializedAccount<SolautoPosition>,
    protocol_position: &'a AccountInfo<'a>,
    protocol_supply_account: &'a AccountInfo<'a>,
    protocol_debt_account: &'a AccountInfo<'a>
) -> ProgramResult {
    let supply_mint = &solauto_position.data.position.supply_mint;
    let debt_mint = &solauto_position.data.position.debt_mint;

    if
        !solauto_position.data.self_managed.val &&
        protocol_position.key != &solauto_position.data.position.protocol_account
    {
        msg!("Incorrect protocol-owned account");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    match lending_platform {
        LendingPlatform::Marginfi => {
            validate_marginfi_bank(protocol_supply_account, &supply_mint)?;
            validate_marginfi_bank(protocol_debt_account, &debt_mint)?;
        }
        LendingPlatform::Kamino => {
            msg!("Not yet supported");
            return Err(SolautoError::IncorrectAccounts.into());
        }
    }

    Ok(())
}

pub fn validate_token_accounts<'a, 'b>(
    solauto_position: &'b DeserializedAccount<'a, SolautoPosition>,
    source_supply_ta: Option<&'a AccountInfo<'a>>,
    source_debt_ta: Option<&'a AccountInfo<'a>>
) -> ProgramResult {
    validate_token_account(solauto_position, source_supply_ta, Some(TokenType::Supply), None)?;
    validate_token_account(solauto_position, source_debt_ta, Some(TokenType::Debt), None)?;
    Ok(())
}

pub fn validate_token_account<'a>(
    solauto_position: &DeserializedAccount<'a, SolautoPosition>,
    source_ta: Option<&'a AccountInfo<'a>>,
    token_type: Option<TokenType>,
    token_mint: Option<&Pubkey>
) -> ProgramResult {
    let mint_key = if token_mint.is_some() {
        token_mint.unwrap()
    } else {
        let mint_key = if token_type.is_some() {
            if token_type.unwrap() == TokenType::Supply {
                &solauto_position.data.position.supply_mint
            } else {
                &solauto_position.data.position.debt_mint
            }
        } else {
            token_mint.unwrap()
        };

        mint_key
    };

    let associated_position_ta = get_associated_token_address(
        &solauto_position.account_info.key,
        mint_key
    );
    let associated_authority_ta = get_associated_token_address(
        &solauto_position.data.authority,
        mint_key
    );

    if
        !solauto_position.data.self_managed.val &&
        source_ta.is_some() &&
        source_ta.unwrap().key != &associated_position_ta &&
        source_ta.unwrap().key != &associated_authority_ta
    {
        msg!("Incorrect token account {}", source_ta.unwrap().key);
        return Err(SolautoError::IncorrectAccounts.into());
    }

    // if account_has_data(source_ta.unwrap()) {
    //     let source_ta_data = solauto_utils::safe_unpack_token_account(source_ta)?;
    //     if
    //         source_ta_data.is_some() &&
    //         !token_account_owned_by(
    //             source_ta_data.as_ref().unwrap(),
    //             &solauto_position.data.authority
    //         ) &&
    //         !token_account_owned_by(source_ta_data.as_ref().unwrap(), solauto_position.account_info.key)
    //     {
    //         msg!("Incorrect token account {}", source_ta.unwrap().key);
    //         return Err(SolautoError::IncorrectAccounts.into());
    //     }

    //     if !solauto_position.data.self_managed.val && source_ta_data.is_some() && &source_ta_data.as_ref().unwrap().data.mint != mint_key {
    //         msg!("Incorrect token account {}", source_ta_data.unwrap().account_info.key);
    //         return Err(SolautoError::IncorrectAccounts.into());
    //     }
    // }

    Ok(())
}

pub fn token_account_owned_by(
    token_account: &DeserializedAccount<TokenAccount>,
    expected_owner: &Pubkey
) -> bool {
    token_account.account_info.owner == &token_program_id &&
        &token_account.data.owner == expected_owner
}

pub fn validate_referral_signer(
    referral_state: &DeserializedAccount<ReferralState>,
    signer: &AccountInfo,
    allow_solauto_manager: bool
) -> ProgramResult {
    let referral_state_pda = Pubkey::create_program_address(
        referral_state.data.seeds_with_bump().as_slice(),
        &crate::ID
    )?;
    if &referral_state_pda != referral_state.account_info.key {
        msg!("Incorrect referral state account provided");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    if !signer.is_signer {
        msg!("Missing required referral signer");
        return Err(ProgramError::MissingRequiredSignature.into());
    }
    if
        signer.key != &referral_state.data.authority &&
        (!allow_solauto_manager || signer.key != &SOLAUTO_MANAGER)
    {
        msg!("Instruction has not been signed by the right account");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    Ok(())
}

pub fn validate_no_active_balances<'a>(
    protocol_account: &'a AccountInfo<'a>,
    lending_platform: LendingPlatform
) -> ProgramResult {
    if lending_platform == LendingPlatform::Marginfi {
        let marginfi_account = DeserializedAccount::<MarginfiAccount>
            ::zerocopy(Some(protocol_account))?
            .unwrap();
        if
            marginfi_account.data.lending_account.balances
                .iter()
                .filter(|balance| balance.active == 1)
                .collect::<Vec<_>>()
                .len() > 0
        {
            msg!(
                "Marginfi account has active balances. Ensure all debt is repaid and supply tokens are withdrawn before closing position"
            );
            return Err(SolautoError::IncorrectAccounts.into());
        }

        Ok(())
    } else {
        msg!("Lending platform not yet supported");
        return Err(SolautoError::IncorrectAccounts.into());
    }
}

pub fn validate_debt_adjustment(
    solauto_position: &SolautoPosition,
    provided_base_unit_amount: u64,
    expected_debt_adjustment_usd: f64,
    pct_threshold_range: f64
) -> ProgramResult {
    let token = if expected_debt_adjustment_usd > 0.0 {
        solauto_position.state.debt
    } else {
        solauto_position.state.supply
    };

    let amount_usd = from_base_unit::<u64, u8, f64>(provided_base_unit_amount, token.decimals).mul(
        token.market_price()
    );

    // Checking if within specified range due to varying price volatility
    if
        (amount_usd - expected_debt_adjustment_usd.abs()).abs().div(amount_usd) >
        pct_threshold_range
    {
        msg!("Base unit amount provided: {}", provided_base_unit_amount);
        msg!(
            "Provided debt adjustment was not what was expected (Provided: ${} vs. expected: ${})",
            amount_usd.abs(),
            expected_debt_adjustment_usd.abs()
        );
        return Err(ProgramError::InvalidInstructionData.into());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::{
        state::solauto_position::{
            AutomationSettings,
            AutomationSettingsInp,
            PositionState,
            SolautoSettingsParameters,
            SolautoSettingsParametersInp,
        },
        types::shared::PositionType,
    };

    use super::*;

    fn test_position_settings(settings: SolautoSettingsParameters, liq_threshold_bps: u16) {
        let mut position_data = PositionData::default();
        position_data.lending_platform = LendingPlatform::Marginfi;
        position_data.setting_params = settings;

        let mut position_state = PositionState::default();
        position_state.max_ltv_bps = 6500;
        position_state.liq_threshold_bps = liq_threshold_bps;

        let solauto_position = SolautoPosition::new(
            1,
            Pubkey::default(),
            PositionType::default(),
            position_data,
            position_state
        );
        let result = validate_position_settings(&solauto_position, 0);
        assert!(result.is_err());
    }

    #[test]
    fn test_invalid_position_settings() {
        let default_liq_threshold_bps = 8000;
        let mut default_settings_args = SolautoSettingsParametersInp::default();
        default_settings_args.boost_to_bps = 5000;
        default_settings_args.boost_gap = 500;
        default_settings_args.repay_to_bps = 9000;
        default_settings_args.repay_gap = 1000;

        test_position_settings(
            SolautoSettingsParameters::from(SolautoSettingsParametersInp {
                boost_gap: MIN_BOOST_GAP_BPS - 10,
                ..default_settings_args
            }),
            default_liq_threshold_bps
        );
        test_position_settings(
            SolautoSettingsParameters::from(SolautoSettingsParametersInp {
                repay_gap: MIN_REPAY_GAP_BPS - 10,
                ..default_settings_args
            }),
            default_liq_threshold_bps
        );
        test_position_settings(
            SolautoSettingsParameters::from(SolautoSettingsParametersInp {
                repay_to_bps: 9500,
                repay_gap: 600,
                ..default_settings_args
            }),
            default_liq_threshold_bps
        );
        test_position_settings(
            SolautoSettingsParameters::from(SolautoSettingsParametersInp {
                boost_to_bps: 500,
                boost_gap: 1000,
                ..default_settings_args
            }),
            default_liq_threshold_bps
        );
        test_position_settings(
            SolautoSettingsParameters::from(SolautoSettingsParametersInp {
                boost_to_bps: 5000,
                repay_to_bps: 4000,
                ..default_settings_args
            }),
            default_liq_threshold_bps
        );
        test_position_settings(
            SolautoSettingsParameters::from(SolautoSettingsParametersInp {
                boost_to_bps: 9600,
                repay_gap: 500,
                ..default_settings_args
            }),
            default_liq_threshold_bps
        );
        test_position_settings(
            SolautoSettingsParameters::from(SolautoSettingsParametersInp {
                repay_to_bps: 9900,
                ..default_settings_args
            }),
            default_liq_threshold_bps
        );
        test_position_settings(
            SolautoSettingsParameters::from(SolautoSettingsParametersInp {
                target_boost_to_bps: Some(10340),
                ..default_settings_args
            }),
            default_liq_threshold_bps
        );
    }

    fn test_automation_settings(current_timestamp: u64, automation_settings: AutomationSettings) {
        let result = validate_automation_settings(&automation_settings, current_timestamp);
        assert!(result.is_err());
    }

    #[test]
    fn test_invalid_automation_settings() {
        let current_timestamp = 100;
        let default_automation_settings_args = AutomationSettingsInp {
            unix_start_date: current_timestamp,
            interval_seconds: 60 * 60 * 24,
            target_periods: 5,
            periods_passed: 0,
        };

        test_automation_settings(
            current_timestamp,
            AutomationSettings::from(AutomationSettingsInp {
                unix_start_date: current_timestamp +
                default_automation_settings_args.interval_seconds +
                100,
                ..default_automation_settings_args
            })
        );
        test_automation_settings(
            current_timestamp,
            AutomationSettings::from(AutomationSettingsInp {
                interval_seconds: 60,
                ..default_automation_settings_args.clone()
            })
        );
        test_automation_settings(
            current_timestamp,
            AutomationSettings::from(AutomationSettingsInp {
                interval_seconds: 60 * 60 * 24 * 60,
                ..default_automation_settings_args.clone()
            })
        );
    }
}
