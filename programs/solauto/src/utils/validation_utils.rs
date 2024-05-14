use std::ops::Div;

use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, msg, program_error::ProgramError,
    pubkey::Pubkey, sysvar::instructions::ID as ixs_sysvar_id,
};
use spl_token::{state::Account as TokenAccount, ID as token_program_id};

use crate::{
    constants::{SOLAUTO_FEES_WALLET, SOLAUTO_MANAGER},
    types::{
        instruction::SolautoStandardAccounts,
        shared::{
            DCADirection, DeserializedAccount, LendingPlatform, PositionData, ReferralStateAccount,
            SolautoError, SolautoPosition, TokenType,
        },
    },
};

use super::{
    math_utils::get_maximum_repay_to_bps_param, solauto_utils::get_referral_account_seeds,
};
use crate::constants::{KAMINO_PROGRAM, MARGINFI_PROGRAM, SOLEND_PROGRAM};

pub fn generic_instruction_validation(
    accounts: &SolautoStandardAccounts,
    lending_platform: LendingPlatform,
    authority_signer_only_ix: bool,
    solauto_managed_only_ix: bool,
) -> ProgramResult {
    validate_position(
        accounts.signer,
        &accounts.solauto_position,
        authority_signer_only_ix,
        solauto_managed_only_ix,
    )?;
    validate_program_account(accounts.lending_protocol, lending_platform)?;

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

pub fn validate_position(
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
    solauto_position: &DeserializedAccount<SolautoPosition>,
) -> ProgramResult {
    if solauto_position.data.self_managed {
        return Ok(());
    }

    let position_data = solauto_position.data.position.as_ref().unwrap();

    if position_data.protocol_data.debt_mint.is_none() && position_data.setting_params.is_some() {
        msg!("Cannot provide setting parameters when not borrowing debt");
        return Err(SolautoError::InvalidPositionSettings.into());
    }

    if position_data.protocol_data.debt_mint.is_some() && position_data.setting_params.is_none() {
        msg!("Must provide setting parameters if position is borrowing debt");
        return Err(SolautoError::InvalidPositionSettings.into());
    }

    let settings = position_data.setting_params.as_ref().unwrap();
    let invalid_params = |error_msg| {
        msg!(error_msg);
        Err(SolautoError::InvalidPositionSettings.into())
    };

    if settings.repay_to_bps < settings.boost_to_bps {
        return invalid_params("repay_to_bps value must be greater than boost_to_bps value");
    }
    if settings.repay_from_bps() > 9800 {
        return invalid_params("repay_to_bps + repay_gap must be equal-to or below 9800");
    }
    if settings.repay_gap < 50 {
        return invalid_params("repay_gap must be 50 or greater");
    }
    if settings.boost_gap < 50 {
        return invalid_params("boost_gap must be 50 or greater");
    }

    if settings.repay_to_bps == 0 && position_data.protocol_data.debt_mint.is_some() {
        return invalid_params("Must provide a valid repay_to_bps if the Solauto position has debt");
    }

    if position_data.state.max_ltv_bps.is_some() {
        let maximum_repay_to_bps = get_maximum_repay_to_bps_param(
            (position_data.state.max_ltv_bps.unwrap() as f64).div(10000.0),
            (position_data.state.liq_threshold_bps as f64).div(10000.0),
        );
        if settings.repay_to_bps > maximum_repay_to_bps {
            return invalid_params(
                format!("For the given max_ltv and liq_threshold of the supplied asset, repay_to_bps must be lower or equal to {} in order to bring the utilization rate to an allowed position", maximum_repay_to_bps).as_str()
            );
        }
    }

    Ok(())
}

pub fn validate_program_account(
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
    let referral_state_seeds = &get_referral_account_seeds(referral_state_authority);
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

pub fn validate_lending_protocol_account(
    solauto_position: &DeserializedAccount<SolautoPosition>,
    protocol_position: &AccountInfo,
) -> ProgramResult {
    if !solauto_position.data.self_managed {
        let protocol_data = &solauto_position
            .data
            .position
            .as_ref()
            .unwrap()
            .protocol_data;

        if protocol_position.key != &protocol_data.protocol_account {
            msg!("Incorrect protocol-owned account");
            return Err(SolautoError::IncorrectAccounts.into());
        }
    }

    Ok(())
}

pub fn validate_token_accounts(
    signer: &AccountInfo,
    solauto_position: &DeserializedAccount<SolautoPosition>,
    source_supply_ta: &DeserializedAccount<TokenAccount>,
    source_debt_ta: Option<&DeserializedAccount<TokenAccount>>,
) -> ProgramResult {
    validate_token_account(
        signer,
        solauto_position,
        Some(source_supply_ta),
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

        let token_mint = if token_type.is_some() {
            if token_type.unwrap() == TokenType::Supply {
                Some(&position.protocol_data.supply_mint)
            } else {
                position.protocol_data.debt_mint.as_ref()
            }
        } else {
            token_mint
        };

        if source_ta.is_some()
            && token_mint.is_some()
            && &source_ta.as_ref().unwrap().data.mint != token_mint.unwrap()
        {
            msg!(
                "Incorrect token account {}",
                source_ta.unwrap().account_info.key
            );
            return Err(SolautoError::IncorrectAccounts.into());
        }
    }

    Ok(())
}

pub fn validate_dca_settings(position_data: &PositionData) -> ProgramResult {
    if position_data.active_dca.is_none() {
        return Ok(());
    }

    if position_data.setting_params.is_none() {
        msg!("Position settings must be set if you are providing DCA settings");
        return Err(SolautoError::InvalidPositionSettings.into());
    }

    let dca = position_data.active_dca.as_ref().unwrap();
    let settings = position_data.setting_params.as_ref().unwrap();
    let invalid_params = |error_msg| {
        msg!(error_msg);
        Err(SolautoError::InvalidDCASettings.into())
    };

    if dca.dca_periods_passed > 0 {
        return invalid_params(
            "DCA periods passed cannot be anything other than 0 when first being set",
        );
    }

    if dca.unix_dca_interval < 60 * 10 || dca.unix_dca_interval > 60 * 60 * 24 * 30 {
        return invalid_params("DCA interval period must be between 10 minutes and 1 month");
    }

    if dca.target_dca_periods == 0 {
        return invalid_params("DCA periods must be greater than or equal to 1");
    }

    if dca.dca_direction == DCADirection::Out && dca.dca_risk_aversion_bps.is_some() {
        return invalid_params("DCA risk aversion BPS parameter is only for when DCAing-in");
    }

    if dca.dca_risk_aversion_bps.is_some() && dca.dca_risk_aversion_bps.unwrap() > 10000 {
        return invalid_params("DCA risk aversion BPS must be between 0 and 10000");
    }

    if let DCADirection::Out = dca.dca_direction {
        if settings.boost_to_bps == 0 {
            return invalid_params("Cannot DCA-out of a position with a boost-to parameter of 0");
        }
    }

    if dca.target_boost_to_bps.is_some() {
        match dca.dca_direction {
            DCADirection::In(_) => {
                if dca.target_boost_to_bps.unwrap() <= settings.boost_to_bps {
                    return invalid_params(
                        "When DCAing-in, target boost-to parameter must be greater than current setting's boost to value"
                    );
                }
            }
            DCADirection::Out => {
                if dca.target_boost_to_bps.unwrap() >= settings.boost_to_bps {
                    return invalid_params(
                        "When DCAing-out, target boost-to parameter must be less than current setting's boost to value"
                    );
                }
            }
        }
    }

    Ok(())
}
