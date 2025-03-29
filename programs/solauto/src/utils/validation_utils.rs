use std::ops::Div;

use marginfi_sdk::{
    generated::accounts::{Bank, MarginfiAccount},
    MARGINFI_ID,
};
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    system_program::ID as system_program_id,
    sysvar::{instructions::ID as ixs_sysvar_id, rent::ID as rent_program_id},
};
use spl_associated_token_account::{get_associated_token_address, ID as ata_program_id};
use spl_token::ID as token_program_id;

use crate::{
    check,
    constants::{MIN_BOOST_GAP_BPS, MIN_REPAY_GAP_BPS, SOLAUTO_MANAGER},
    error_if,
    state::{
        automation::AutomationSettings,
        referral_state::ReferralState,
        solauto_position::{PositionData, SolautoPosition},
    },
    types::{
        errors::SolautoError,
        instruction::SolautoStandardAccounts,
        shared::{DeserializedAccount, LendingPlatform, TokenType},
    },
};

use super::{
    math_utils::{get_max_boost_to_bps, get_max_repay_from_bps, get_max_repay_to_bps},
    solauto_utils::safe_unpack_token_account,
};

pub fn generic_instruction_validation(
    accounts: &Box<SolautoStandardAccounts>,
    lending_platform: LendingPlatform,
    authority_signer_only_ix: bool,
    solauto_managed_only_ix: bool,
) -> ProgramResult {
    validate_instruction(
        accounts.signer,
        &accounts.solauto_position,
        authority_signer_only_ix,
        solauto_managed_only_ix,
    )?;
    validate_lending_program_account(accounts.lending_protocol, lending_platform)?;
    validate_standard_programs(
        Some(accounts.system_program),
        Some(accounts.token_program),
        accounts.ata_program,
        accounts.rent,
        accounts.ixs_sysvar,
    )?;

    if accounts.authority_referral_state.is_some() {
        validate_referral_accounts(
            &accounts.solauto_position.data.authority,
            accounts.authority_referral_state.as_ref().unwrap(),
            accounts.referred_by_ta,
            true,
        )?;
    }

    // The solauto_fees_ta is validated at payout before transfer
    Ok(())
}

pub fn validate_instruction(
    signer: &AccountInfo,
    solauto_position: &DeserializedAccount<SolautoPosition>,
    authority_signer_only_ix: bool,
    solauto_managed_only_ix: bool,
) -> ProgramResult {
    check!(&signer.is_signer, ProgramError::MissingRequiredSignature);

    let position_authority = solauto_position.data.authority;
    let authority_signed = || {
        let expected_solauto_position_address = Pubkey::create_program_address(
            solauto_position.data.seeds_with_bump().as_slice(),
            &crate::ID,
        )
        .expect("Ok");
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

    error_if!(
        solauto_managed_only_ix && solauto_position.data.self_managed.val,
        SolautoError::IncorrectAccounts
    );

    error_if!(
        solauto_position.data.self_managed.val && signer.key == &SOLAUTO_MANAGER,
        SolautoError::IncorrectAccounts
    );

    Ok(())
}

pub fn validate_position_settings(solauto_position: &SolautoPosition) -> ProgramResult {
    let invalid_params = |error_msg| {
        msg!(error_msg);
        Err(SolautoError::InvalidPositionSettings.into())
    };

    let data = &solauto_position.position;
    if data.settings.repay_to_bps < data.settings.boost_to_bps {
        return invalid_params("repay_to_bps value must be greater than boost_to_bps value");
    }
    let max_boost_to = get_max_boost_to_bps(
        solauto_position.state.max_ltv_bps,
        solauto_position.state.liq_threshold_bps,
    );
    if data.settings.boost_to_bps > max_boost_to {
        return invalid_params(
            format!("Exceeds the maximum boost-to of {}", max_boost_to).as_str(),
        );
    }

    if data.settings.repay_gap < MIN_REPAY_GAP_BPS {
        return invalid_params(
            format!("repay_gap must be {} or greater", MIN_REPAY_GAP_BPS).as_str(),
        );
    }
    if data.settings.boost_gap < MIN_BOOST_GAP_BPS {
        return invalid_params(
            format!("boost_gap must be {} or greater", MIN_BOOST_GAP_BPS).as_str(),
        );
    }

    let max_repay_to_bps = get_max_repay_to_bps(
        solauto_position.state.max_ltv_bps,
        solauto_position.state.liq_threshold_bps,
    );
    if data.settings.repay_to_bps > max_repay_to_bps {
        return invalid_params(
            format!("For the given max_ltv and liq_threshold of the supplied asset, repay_to_bps must be lower or equal to {} in order to bring the utilization rate to an allowed position", max_repay_to_bps).as_str()
        );
    }
    let max_repay_from_bps = get_max_repay_from_bps(
        solauto_position.state.max_ltv_bps,
        solauto_position.state.liq_threshold_bps,
    );
    if data.settings.repay_to_bps + data.settings.repay_gap > max_repay_from_bps {
        return invalid_params(
            format!(
                "repay_to_bps + repay_gap must be equal-to or below {}",
                max_repay_from_bps
            )
            .as_str(),
        );
    }

    Ok(())
}

pub fn validate_dca_settings(
    position: &PositionData,
    current_unix_timestamp: u64,
) -> ProgramResult {
    if position.dca.is_active() {
        return Ok(());
    }

    validate_automation_settings(&position.dca.automation, current_unix_timestamp)
}

pub fn validate_automation_settings(
    automation: &AutomationSettings,
    current_unix_timestamp: u64,
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

    if current_unix_timestamp < automation.unix_start_date
        || current_unix_timestamp > automation.unix_start_date + automation.interval_seconds
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
    lending_platform: LendingPlatform,
) -> ProgramResult {
    match lending_platform {
        LendingPlatform::Marginfi => {
            check!(*program.key == MARGINFI_ID, SolautoError::IncorrectAccounts);
        }
    }
    // We don't need to check more than this, as lending protocols have their own account checks and will fail during CPI if there is an issue with the provided accounts
    Ok(())
}

pub fn validate_standard_programs(
    system_program: Option<&AccountInfo>,
    token_program: Option<&AccountInfo>,
    ata_program: Option<&AccountInfo>,
    rent: Option<&AccountInfo>,
    ixs_sysvar: Option<&AccountInfo>,
) -> ProgramResult {
    check!(
        system_program.is_none() || system_program.unwrap().key == &system_program_id,
        SolautoError::IncorrectAccounts
    );
    check!(
        token_program.is_none() || token_program.unwrap().key == &token_program_id,
        SolautoError::IncorrectAccounts
    );
    check!(
        ata_program.is_none() || ata_program.unwrap().key == &ata_program_id,
        SolautoError::IncorrectAccounts
    );
    check!(
        rent.is_none() || rent.unwrap().key == &rent_program_id,
        SolautoError::IncorrectAccounts
    );
    check!(
        ixs_sysvar.is_none() || ixs_sysvar.unwrap().key == &ixs_sysvar_id,
        SolautoError::IncorrectAccounts
    );
    Ok(())
}

pub fn validate_referral_accounts<'a>(
    referral_state_authority: &Pubkey,
    authority_referral_state: &DeserializedAccount<'a, ReferralState>,
    referred_by_ta: Option<&'a AccountInfo<'a>>,
    validate_ta: bool,
) -> ProgramResult {
    let referral_state_pda = Pubkey::create_program_address(
        authority_referral_state.data.seeds_with_bump().as_slice(),
        &crate::ID,
    )?;
    error_if!(
        &authority_referral_state.data.authority != referral_state_authority
            || &referral_state_pda != authority_referral_state.account_info.key,
        SolautoError::IncorrectAccounts
    );

    let authority_referred_by_state = &authority_referral_state.data.referred_by_state;

    error_if!(
        validate_ta
            && authority_referred_by_state != &Pubkey::default()
            && referred_by_ta.is_none(),
        SolautoError::IncorrectAccounts
    );
    // The referred_by_ta is further validated at payout before transfer

    Ok(())
}

pub fn validate_marginfi_bank<'a>(
    marginfi_bank: &'a AccountInfo<'a>,
    mint: &Pubkey,
) -> ProgramResult {
    if mint == &Pubkey::default() {
        return Ok(());
    }

    let bank = DeserializedAccount::<Bank>::zerocopy(Some(marginfi_bank))?.unwrap();
    check!(&bank.data.mint == mint, SolautoError::IncorrectAccounts);

    Ok(())
}

pub fn validate_lending_program_accounts_with_position<'a>(
    lending_platform: LendingPlatform,
    solauto_position: &DeserializedAccount<SolautoPosition>,
    protocol_user_account: &'a AccountInfo<'a>,
    protocol_supply_account: &'a AccountInfo<'a>,
    protocol_debt_account: &'a AccountInfo<'a>,
) -> ProgramResult {
    let supply_mint = &solauto_position.data.state.supply.mint;
    let debt_mint = &solauto_position.data.state.debt.mint;

    error_if!(
        !solauto_position.data.self_managed.val
            && protocol_user_account.key != &solauto_position.data.position.protocol_user_account,
        SolautoError::IncorrectAccounts
    );

    match lending_platform {
        LendingPlatform::Marginfi => {
            validate_marginfi_bank(protocol_supply_account, &supply_mint)?;
            validate_marginfi_bank(protocol_debt_account, &debt_mint)?;
        }
    }

    Ok(())
}

pub fn validate_token_accounts<'a, 'b>(
    solauto_position: &'b DeserializedAccount<'a, SolautoPosition>,
    source_supply_ta: Option<&'a AccountInfo<'a>>,
    source_debt_ta: Option<&'a AccountInfo<'a>>,
) -> ProgramResult {
    validate_token_account(
        solauto_position,
        source_supply_ta,
        Some(TokenType::Supply),
        None,
    )?;
    validate_token_account(
        solauto_position,
        source_debt_ta,
        Some(TokenType::Debt),
        None,
    )?;
    Ok(())
}

pub fn validate_token_account<'a>(
    solauto_position: &DeserializedAccount<'a, SolautoPosition>,
    source_ta: Option<&'a AccountInfo<'a>>,
    token_type: Option<TokenType>,
    token_mint: Option<&Pubkey>,
) -> ProgramResult {
    if solauto_position.data.self_managed.val && token_mint.is_none() {
        return Ok(());
    }

    let mint_key = if token_mint.is_some() {
        token_mint.unwrap()
    } else {
        let mint_key = if token_type.unwrap() == TokenType::Supply {
            &solauto_position.data.state.supply.mint
        } else {
            &solauto_position.data.state.debt.mint
        };
        mint_key
    };

    let associated_position_ta =
        get_associated_token_address(&solauto_position.account_info.key, mint_key);
    let associated_authority_ta =
        get_associated_token_address(&solauto_position.data.authority, mint_key);

    error_if!(
        source_ta.is_some()
            && source_ta.unwrap().key != &associated_position_ta
            && source_ta.unwrap().key != &associated_authority_ta,
        SolautoError::IncorrectAccounts
    );

    Ok(())
}

pub fn token_account_owned_by<'a>(
    token_account: &'a AccountInfo<'a>,
    expected_owner: &Pubkey,
    token_mint: Option<&Pubkey>,
) -> Result<bool, ProgramError> {
    if token_mint.is_some() {
        return Ok(
            token_account.key == &get_associated_token_address(expected_owner, token_mint.unwrap())
        );
    } else {
        let token_account_data = safe_unpack_token_account(Some(token_account))?.unwrap();
        return Ok(token_account_data.account_info.owner == &token_program_id
            && &token_account_data.data.owner == expected_owner);
    }
}

pub fn validate_referral_signer(
    referral_state: &DeserializedAccount<ReferralState>,
    signer: &AccountInfo,
    allow_solauto_manager: bool,
) -> ProgramResult {
    let referral_state_pda = Pubkey::create_program_address(
        referral_state.data.seeds_with_bump().as_slice(),
        &crate::ID,
    )?;
    check!(&signer.is_signer, ProgramError::MissingRequiredSignature);
    check!(
        &referral_state_pda == referral_state.account_info.key,
        SolautoError::IncorrectAccounts
    );

    error_if!(
        signer.key != &referral_state.data.authority
            && (!allow_solauto_manager || signer.key != &SOLAUTO_MANAGER),
        SolautoError::IncorrectAccounts
    );

    Ok(())
}

pub fn validate_no_active_balances<'a>(
    protocol_account: &'a AccountInfo<'a>,
    lending_platform: LendingPlatform,
) -> ProgramResult {
    if lending_platform == LendingPlatform::Marginfi {
        let marginfi_account =
            DeserializedAccount::<MarginfiAccount>::zerocopy(Some(protocol_account))?.unwrap();

        check!(
            marginfi_account
                .data
                .lending_account
                .balances
                .iter()
                .filter(|balance| balance.active == 1)
                .collect::<Vec<_>>()
                .len()
                == 0,
            SolautoError::IncorrectAccounts
        );

        Ok(())
    } else {
        msg!("Lending platform not yet supported");
        return Err(SolautoError::IncorrectAccounts.into());
    }
}

pub fn correct_token_account(token_account: &Pubkey, wallet: &Pubkey, mint: &Pubkey) -> bool {
    token_account == &get_associated_token_address(wallet, mint)
}

pub fn value_lte_with_threshold(value: f64, target_value: f64, threshold: f64) -> bool {
    if target_value == 0.0 {
        return value == 0.0;
    }
    value < target_value || (value - target_value).abs().div(target_value) < threshold
}

pub fn value_gte_with_threshold(value: f64, target_value: f64, threshold: f64) -> bool {
    if target_value == 0.0 {
        return value == 0.0;
    }
    value > target_value || (value - target_value).abs().div(target_value) < threshold
}

pub fn value_match_with_threshold(value: f64, target_value: f64, threshold: f64) -> bool {
    if target_value == 0.0 {
        return value == 0.0;
    }
    (value - target_value).abs().div(target_value) < threshold
}

#[cfg(test)]
mod tests {
    use crate::{
        state::{
            automation::{AutomationSettings, AutomationSettingsInp},
            solauto_position::{
                PositionState, SolautoSettingsParameters, SolautoSettingsParametersInp,
            },
        },
        types::shared::PositionType,
    };

    use super::*;

    fn test_position_settings(settings: SolautoSettingsParameters, liq_threshold_bps: u16) {
        let mut position_data = PositionData::default();
        position_data.lending_platform = LendingPlatform::Marginfi;
        position_data.settings = settings;

        let mut position_state = PositionState::default();
        position_state.max_ltv_bps = 6500;
        position_state.liq_threshold_bps = liq_threshold_bps;

        let solauto_position = SolautoPosition::new(
            1,
            Pubkey::default(),
            PositionType::default(),
            position_data,
            position_state,
        );
        let result = validate_position_settings(&solauto_position);
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
            default_liq_threshold_bps,
        );
        test_position_settings(
            SolautoSettingsParameters::from(SolautoSettingsParametersInp {
                repay_gap: MIN_REPAY_GAP_BPS - 10,
                ..default_settings_args
            }),
            default_liq_threshold_bps,
        );
        test_position_settings(
            SolautoSettingsParameters::from(SolautoSettingsParametersInp {
                repay_to_bps: 9500,
                repay_gap: 600,
                ..default_settings_args
            }),
            default_liq_threshold_bps,
        );
        test_position_settings(
            SolautoSettingsParameters::from(SolautoSettingsParametersInp {
                boost_to_bps: 500,
                boost_gap: 1000,
                ..default_settings_args
            }),
            default_liq_threshold_bps,
        );
        test_position_settings(
            SolautoSettingsParameters::from(SolautoSettingsParametersInp {
                boost_to_bps: 5000,
                repay_to_bps: 4000,
                ..default_settings_args
            }),
            default_liq_threshold_bps,
        );
        test_position_settings(
            SolautoSettingsParameters::from(SolautoSettingsParametersInp {
                boost_to_bps: 9600,
                repay_gap: 500,
                ..default_settings_args
            }),
            default_liq_threshold_bps,
        );
        test_position_settings(
            SolautoSettingsParameters::from(SolautoSettingsParametersInp {
                repay_to_bps: 9900,
                ..default_settings_args
            }),
            default_liq_threshold_bps,
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
                unix_start_date: current_timestamp
                    + default_automation_settings_args.interval_seconds
                    + 100,
                ..default_automation_settings_args
            }),
        );
        test_automation_settings(
            current_timestamp,
            AutomationSettings::from(AutomationSettingsInp {
                interval_seconds: 60,
                ..default_automation_settings_args.clone()
            }),
        );
        test_automation_settings(
            current_timestamp,
            AutomationSettings::from(AutomationSettingsInp {
                interval_seconds: 60 * 60 * 24 * 60,
                ..default_automation_settings_args.clone()
            }),
        );
    }
}
