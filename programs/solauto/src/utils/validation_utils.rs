use std::ops::Div;

use marginfi_sdk::generated::accounts::Bank;
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, msg, program_error::ProgramError,
    pubkey::Pubkey, sysvar::instructions::ID as ixs_sysvar_id,
};
use solend_sdk::state::Reserve;
use spl_token::{state::Account as TokenAccount, ID as token_program_id};

use crate::{
    constants::{SOLAUTO_FEES_WALLET, SOLAUTO_MANAGER},
    types::{
        instruction::SolautoStandardAccounts,
        shared::{
            AutomationSettings, DeserializedAccount, LendingPlatform, PositionData,
            ReferralStateAccount, SolautoError, SolautoPosition, TokenType,
        },
    },
};

use super::math_utils::get_maximum_repay_to_bps_param;
use crate::constants::{KAMINO_PROGRAM, MARGINFI_PROGRAM, SOLEND_PROGRAM};

pub fn generic_instruction_validation(
    accounts: &SolautoStandardAccounts,
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

    if accounts.authority_referral_state.is_some() {
        validate_referral_accounts(
            &accounts.solauto_position.data.authority,
            accounts.authority_referral_state.as_ref().unwrap(),
            accounts.referred_by_state,
            accounts.referred_by_supply_ta.as_ref(),
            true,
        )?;
    }

    if accounts.solauto_fees_supply_ta.is_some()
        && accounts
            .solauto_fees_supply_ta
            .as_ref()
            .unwrap()
            .account_info
            .owner
            == &token_program_id
        && accounts.solauto_fees_supply_ta.as_ref().unwrap().data.owner != SOLAUTO_FEES_WALLET
    {
        return Err(SolautoError::IncorrectAccounts.into());
    }

    // TODO add standard program address validation for all instructions
    if accounts.ixs_sysvar.is_some() && accounts.ixs_sysvar.unwrap().key != &ixs_sysvar_id {
        msg!("Incorrect ixs sysvar account provided");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    Ok(())
}

pub fn validate_instruction(
    signer: &AccountInfo,
    solauto_position: &DeserializedAccount<SolautoPosition>,
    authority_signer_only_ix: bool,
    solauto_managed_only_ix: bool,
) -> ProgramResult {
    if !signer.is_signer {
        msg!("Signer account is not a signer");
        return Err(ProgramError::MissingRequiredSignature.into());
    }

    let position_authority = solauto_position.data.authority;

    if authority_signer_only_ix {
        if signer.key != &position_authority {
            msg!(
                "Authority-only instruction, invalid signer for the specified instruction & Solauto position"
            );
            return Err(SolautoError::IncorrectAccounts.into());
        }

        let (pda, _) =
            Pubkey::find_program_address(solauto_position.data.seeds().as_slice(), &crate::ID);
        if &pda != solauto_position.account_info.key {
            msg!("Invalid position specified for the current signer");
            return Err(ProgramError::MissingRequiredSignature.into());
        }
    } else if signer.key != &SOLAUTO_MANAGER {
        msg!("Solauto instruction can only be signed by the position authority or Solauto manager");
        return Err(ProgramError::MissingRequiredSignature.into());
    }

    if solauto_managed_only_ix && solauto_position.data.self_managed {
        msg!("Cannot perform the desired instruction on a self-managed position");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    Ok(())
}

pub fn validate_position_settings(
    data: &PositionData,
    current_unix_timestamp: u64,
) -> ProgramResult {
    let invalid_params = |error_msg| {
        msg!(error_msg);
        Err(SolautoError::InvalidPositionSettings.into())
    };

    if data.setting_params.repay_to_bps < data.setting_params.boost_to_bps {
        return invalid_params("repay_to_bps value must be greater than boost_to_bps value");
    }
    if data.setting_params.repay_from_bps() > 9800 {
        return invalid_params("repay_to_bps + repay_gap must be equal-to or below 9800");
    }
    if data.setting_params.repay_gap < 500 {
        return invalid_params("repay_gap must be 500 or greater");
    }
    if data.setting_params.boost_gap < 100 {
        return invalid_params("boost_gap must be 100 or greater");
    }

    if (data.setting_params.automation.is_some()
        && data.setting_params.target_boost_to_bps.is_none())
        || (data.setting_params.automation.is_none()
            && data.setting_params.target_boost_to_bps.is_some())
    {
        return invalid_params(
            "Automation and target_boost_to_bps must both be provided or neither at all",
        );
    }

    if data.setting_params.automation.is_some() {
        validate_automation_settings(
            data.setting_params.automation.as_ref().unwrap(),
            current_unix_timestamp,
        )?;
    } else if data.active_dca.is_some() && data.active_dca.as_ref().unwrap().add_to_pos.is_none() {
        return invalid_params(
            "target_boost_to_bps & automation must be provided if position has an active_dca without an add_to_pos"
        );
    }

    if data.state.max_ltv_bps.is_some() {
        let maximum_repay_to_bps = get_maximum_repay_to_bps_param(
            (data.state.max_ltv_bps.unwrap() as f64).div(10000.0),
            (data.state.liq_threshold_bps as f64).div(10000.0),
        );
        if data.setting_params.repay_to_bps > maximum_repay_to_bps {
            return invalid_params(
                format!("For the given max_ltv and liq_threshold of the supplied asset, repay_to_bps must be lower or equal to {} in order to bring the utilization rate to an allowed position", maximum_repay_to_bps).as_str()
            );
        }
    }

    Ok(())
}

pub fn validate_dca_settings(
    position: &PositionData,
    current_unix_timestamp: u64,
) -> ProgramResult {
    if position.active_dca.is_none() {
        return Ok(());
    }
    let dca = position.active_dca.as_ref().unwrap();

    validate_automation_settings(&dca.automation, current_unix_timestamp)?;

    if dca.add_to_pos.is_some()
        && dca.add_to_pos.as_ref().unwrap().risk_aversion_bps.is_some()
        && dca.add_to_pos.as_ref().unwrap().risk_aversion_bps.unwrap() > 10000
    {
        msg!("DCA risk aversion BPS must be between 0 and 10000");
        return Err(SolautoError::InvalidDCASettings.into());
    }

    Ok(())
}

pub fn validate_automation_settings(
    automation: &AutomationSettings,
    current_unix_timestamp: u64,
) -> ProgramResult {
    let invalid_params = |error_msg| {
        msg!(error_msg);
        Err(SolautoError::InvalidAutomationData.into())
    };

    if automation.periods_passed > 0 {
        return invalid_params(
            "periods_passed cannot be anything other than 0 when first being set",
        );
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
        return invalid_params("Target periods must be greater than or equal to 1");
    }

    Ok(())
}

pub fn validate_lending_program_account(
    program: &AccountInfo,
    lending_platform: LendingPlatform,
) -> ProgramResult {
    match lending_platform {
        LendingPlatform::Solend => {
            if *program.key != SOLEND_PROGRAM {
                msg!("Incorrect Solend program account");
                return Err(ProgramError::IncorrectProgramId.into());
            }
        }
        LendingPlatform::Marginfi => {
            if *program.key != MARGINFI_PROGRAM {
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

pub fn require_accounts(accounts: &[Option<&AccountInfo>]) -> ProgramResult {
    for acc in accounts.into_iter() {
        if acc.is_none() {
            return Err(SolautoError::IncorrectAccounts.into());
        }
    }
    Ok(())
}

pub fn validate_referral_accounts(
    referral_state_authority: &Pubkey,
    authority_referral_state: &DeserializedAccount<ReferralStateAccount>,
    referred_by_state: Option<&AccountInfo>,
    referred_by_supply_ta: Option<&DeserializedAccount<TokenAccount>>,
    check_supply_ta: bool,
) -> ProgramResult {
    let referral_state_seeds = &ReferralStateAccount::seeds(referral_state_authority);
    let (referral_state_pda, _bump) =
        Pubkey::find_program_address(referral_state_seeds, &crate::ID);
    if &referral_state_pda != authority_referral_state.account_info.key {
        msg!("Invalid referral position account given for the provided authority");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    let authority_referred_by_state = authority_referral_state.data.referred_by_state;

    if referred_by_state.is_some()
        && referred_by_state.as_ref().unwrap().key != authority_referred_by_state.as_ref().unwrap()
    {
        msg!("Provided incorrect referred_by_state account given the authority referral state");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    if check_supply_ta
        && authority_referred_by_state.is_some()
        && (referred_by_supply_ta.is_none()
            || referred_by_supply_ta.as_ref().unwrap().account_info.owner != &token_program_id
            || &referred_by_supply_ta.as_ref().unwrap().data.owner
                != referred_by_state.as_ref().unwrap().key)
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
    solauto_position: &DeserializedAccount<SolautoPosition>,
    is_supply: bool,
) -> ProgramResult {
    let bank = DeserializedAccount::<Bank>::deserialize(Some(marginfi_bank))?.unwrap();

    if solauto_position.data.self_managed {
        return Ok(());
    }

    let position_data = solauto_position.data.position.as_ref().unwrap();
    let position_mint = if is_supply {
        position_data.protocol_data.supply_mint
    } else {
        position_data.protocol_data.debt_mint
    };
    if bank.data.mint != position_mint {
        msg!("Provided incorrect bank account");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    Ok(())
}

pub fn validate_solend_reserve<'a>(
    solend_reserve: &'a AccountInfo<'a>,
    solauto_position: &DeserializedAccount<SolautoPosition>,
    is_supply: bool,
) -> ProgramResult {
    let reserve = DeserializedAccount::<Reserve>::unpack(Some(solend_reserve))?.unwrap();

    if solauto_position.data.self_managed {
        return Ok(());
    }

    let position_data = solauto_position.data.position.as_ref().unwrap();
    let position_mint = if is_supply {
        position_data.protocol_data.supply_mint
    } else {
        position_data.protocol_data.debt_mint
    };
    if reserve.data.liquidity.mint_pubkey != position_mint {
        msg!("Provided incorrect bank account");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    Ok(())
}

pub fn validate_lending_program_accounts_with_position<'a>(
    solauto_position: &DeserializedAccount<SolautoPosition>,
    protocol_position: &'a AccountInfo<'a>,
    protocol_supply_account: Option<&'a AccountInfo<'a>>,
    protocol_debt_account: Option<&'a AccountInfo<'a>>,
) -> ProgramResult {
    if solauto_position.data.self_managed {
        return Ok(());
    }

    let position_data = &solauto_position.data.position.as_ref().unwrap();

    if protocol_position.key != &position_data.protocol_data.protocol_account {
        msg!("Incorrect protocol-owned account");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    match position_data.lending_platform {
        LendingPlatform::Marginfi => {
            if protocol_supply_account.is_some() {
                validate_marginfi_bank(protocol_supply_account.unwrap(), solauto_position, true)?;
            }
            if protocol_debt_account.is_some() {
                validate_marginfi_bank(protocol_debt_account.unwrap(), solauto_position, false)?;
            }
        }
        LendingPlatform::Solend => {
            if protocol_supply_account.is_some() {
                validate_solend_reserve(protocol_supply_account.unwrap(), solauto_position, true)?;
            }
            if protocol_debt_account.is_some() {
                validate_solend_reserve(protocol_debt_account.unwrap(), solauto_position, false)?;
            }
        }
        LendingPlatform::Kamino => {
            msg!("Not yet supported");
            return Err(SolautoError::IncorrectAccounts.into());
        }
    }

    Ok(())
}

pub fn validate_token_accounts(
    signer: &AccountInfo,
    solauto_position: &DeserializedAccount<SolautoPosition>,
    source_supply_ta: Option<&DeserializedAccount<TokenAccount>>,
    source_debt_ta: Option<&DeserializedAccount<TokenAccount>>,
) -> ProgramResult {
    validate_token_account(
        signer,
        solauto_position,
        source_supply_ta,
        Some(TokenType::Supply),
        None,
    )?;
    validate_token_account(
        signer,
        solauto_position,
        source_debt_ta,
        Some(TokenType::Debt),
        None,
    )?;
    Ok(())
}

pub fn validate_token_account(
    signer: &AccountInfo,
    solauto_position: &DeserializedAccount<SolautoPosition>,
    source_ta: Option<&DeserializedAccount<TokenAccount>>,
    token_type: Option<TokenType>,
    token_mint: Option<&Pubkey>,
) -> ProgramResult {
    if source_ta.is_some()
        && &source_ta.as_ref().unwrap().data.owner != signer.key
        && &source_ta.as_ref().unwrap().data.owner != solauto_position.account_info.key
    {
        msg!(
            "Incorrect token account {}",
            source_ta.unwrap().account_info.key
        );
        return Err(SolautoError::IncorrectAccounts.into());
    }

    if !solauto_position.data.self_managed {
        let position = solauto_position.data.position.as_ref().unwrap();

        let mint_key = if token_type.is_some() {
            if token_type.unwrap() == TokenType::Supply {
                &position.protocol_data.supply_mint
            } else {
                &position.protocol_data.debt_mint
            }
        } else {
            token_mint.unwrap()
        };

        if source_ta.is_some() && &source_ta.as_ref().unwrap().data.mint != mint_key {
            msg!(
                "Incorrect token account {}",
                source_ta.unwrap().account_info.key
            );
            return Err(SolautoError::IncorrectAccounts.into());
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::types::shared::{
        AutomationSettings, LendingProtocolPositionData, PositionState,
        SolautoSettingsParameters,
    };

    use super::*;

    fn test_position_settings(
        settings: SolautoSettingsParameters,
        liq_threshold_bps: u16,
        max_ltv_bps: Option<u16>,
    ) {
        let position_data = PositionData {
            state: PositionState {
                liq_utilization_rate_bps: 0,
                net_worth_base_amount_usd: 0,
                net_worth_base_amount_supply_mint: 0,
                base_amount_supplied: 0,
                base_amount_borrowed: 0,
                max_ltv_bps,
                liq_threshold_bps,
                last_updated: 0,
            },
            lending_platform: LendingPlatform::Marginfi,
            protocol_data: LendingProtocolPositionData {
                supply_mint: Pubkey::default(),
                debt_mint: Pubkey::default(),
                protocol_account: Pubkey::default(),
            },
            setting_params: settings,
            active_dca: None,
            debt_ta_balance: 0,
        };
        let result = validate_position_settings(&position_data, 0);
        assert!(result.is_err());
    }

    #[test]
    fn test_invalid_position_settings() {
        let default_liq_threshold_bps = 8000;
        let default_max_ltv_bps = None;
        let default_settings = SolautoSettingsParameters {
            boost_to_bps: 5000,
            boost_gap: 500,
            repay_to_bps: 9000,
            repay_gap: 1000,
            target_boost_to_bps: None,
            automation: None,
        };
        test_position_settings(
            SolautoSettingsParameters {
                boost_gap: 50,
                ..default_settings
            },
            default_liq_threshold_bps,
            default_max_ltv_bps,
        );
        test_position_settings(
            SolautoSettingsParameters {
                repay_gap: 200,
                ..default_settings
            },
            default_liq_threshold_bps,
            default_max_ltv_bps,
        );
        test_position_settings(
            SolautoSettingsParameters {
                repay_to_bps: 9500,
                repay_gap: 600,
                ..default_settings
            },
            default_liq_threshold_bps,
            default_max_ltv_bps,
        );
        test_position_settings(
            SolautoSettingsParameters {
                boost_to_bps: 500,
                boost_gap: 1000,
                ..default_settings
            },
            default_liq_threshold_bps,
            default_max_ltv_bps,
        );
        test_position_settings(
            SolautoSettingsParameters {
                boost_to_bps: 5000,
                repay_to_bps: 4000,
                ..default_settings
            },
            default_liq_threshold_bps,
            default_max_ltv_bps,
        );
        test_position_settings(
            SolautoSettingsParameters {
                boost_to_bps: 9600,
                repay_gap: 500,
                ..default_settings
            },
            default_liq_threshold_bps,
            Some(6500),
        );
        test_position_settings(
            SolautoSettingsParameters {
                target_boost_to_bps: Some(6500),
                ..default_settings
            },
            default_liq_threshold_bps,
            default_max_ltv_bps,
        );
        test_position_settings(
            SolautoSettingsParameters {
                automation: Some(AutomationSettings::default()),
                ..default_settings
            },
            default_liq_threshold_bps,
            default_max_ltv_bps,
        );
    }

    fn test_automation_settings(current_timestamp: u64, automation_settings: AutomationSettings) {
        let result = validate_automation_settings(&automation_settings, current_timestamp);
        assert!(result.is_err());
    }

    #[test]
    fn test_invalid_automation_settings() {
        let current_timestamp = 100;
        let default_automation_settings = AutomationSettings {
            unix_start_date: current_timestamp,
            interval_seconds: 60 * 60 * 24,
            periods_passed: 0,
            target_periods: 5,
        };
        test_automation_settings(
            current_timestamp,
            AutomationSettings {
                unix_start_date: current_timestamp
                    + default_automation_settings.interval_seconds
                    + 100,
                ..default_automation_settings
            },
        );
        test_automation_settings(
            current_timestamp,
            AutomationSettings {
                periods_passed: 1,
                ..default_automation_settings.clone()
            },
        );
        test_automation_settings(
            current_timestamp,
            AutomationSettings {
                target_periods: 0,
                ..default_automation_settings.clone()
            },
        );
        test_automation_settings(
            current_timestamp,
            AutomationSettings {
                interval_seconds: 60,
                ..default_automation_settings.clone()
            },
        );
        test_automation_settings(
            current_timestamp,
            AutomationSettings {
                interval_seconds: 60 * 60 * 24 * 60,
                ..default_automation_settings.clone()
            },
        );
    }
}
