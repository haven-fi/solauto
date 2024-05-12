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
            DCADirection, DCASettings, DeserializedAccount, LendingPlatform, ReferralStateAccount,
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
    authority_only_ix: bool,
    lending_platform: LendingPlatform,
) -> ProgramResult {
    validate_signer(
        accounts.signer,
        &accounts.solauto_position,
        authority_only_ix,
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

pub fn validate_signer(
    signer: &AccountInfo,
    solauto_position: &DeserializedAccount<SolautoPosition>,
    authority_only_ix: bool,
) -> ProgramResult {
    if !signer.is_signer {
        msg!("Signer account is not a signer");
        return Err(ProgramError::MissingRequiredSignature.into());
    }

    let position_authority = solauto_position.data.authority;

    if authority_only_ix {
        if signer.key != &position_authority {
            msg!(
                "Authority-only instruction, invalid signer for the specified instruction & Solauto position"
            );
            return Err(SolautoError::IncorrectAccounts.into());
        }

        let seeds = &[&[solauto_position.data.position_id], signer.key.as_ref()];
        let (pda, _bump) = Pubkey::find_program_address(seeds, &crate::ID);
        if &pda != solauto_position.account_info.key {
            msg!("Invalid position specified for the current signer");
            return Err(ProgramError::MissingRequiredSignature.into());
        }
    } else if signer.key != &SOLAUTO_MANAGER {
        msg!(
            "Rebalance instruction can only be done by the position authority or Solauto rebalancer"
        );
        return Err(ProgramError::MissingRequiredSignature.into());
    }

    Ok(())
}

pub fn validate_position_settings(
    solauto_position: &DeserializedAccount<SolautoPosition>,
    max_ltv: f64,
    liq_threshold: f64,
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

    if settings.repay_from_bps <= settings.repay_to_bps {
        return invalid_params("repay_from_bps value must be greater than repay_to_bps value");
    }
    if settings.boost_from_bps >= settings.boost_to_bps {
        return invalid_params("boost_from_bps value must be less than boost_to_bps value");
    }
    if settings.repay_from_bps - settings.repay_to_bps < 50 {
        return invalid_params(
            "Minimum difference between repay_from_bps and repay_to_bps must be 50 or greater",
        );
    }
    if settings.boost_to_bps - settings.boost_from_bps < 50 {
        return invalid_params(
            "Minimum difference between boost_to_bps to boost_from_bps must be 50 or greater",
        );
    }

    let maximum_repay_to_bps = get_maximum_repay_to_bps_param(max_ltv, liq_threshold);
    if settings.repay_to_bps > maximum_repay_to_bps {
        return invalid_params(
            format!("For the given max_ltv and liq_threshold of the supplied asset, repay_to_bps must be lower or equal to {} in order to bring the utilization rate to an allowed position", maximum_repay_to_bps).as_str()
        );
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
    signer: &AccountInfo,
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
        TokenType::Supply,
    )?;
    validate_token_account(signer, solauto_position, source_debt_ta, TokenType::Debt)?;
    Ok(())
}

pub fn validate_token_account(
    signer: &AccountInfo,
    solauto_position: &DeserializedAccount<SolautoPosition>,
    source_ta: Option<&DeserializedAccount<TokenAccount>>,
    token_type: TokenType,
) -> ProgramResult {
    if source_ta.is_some()
        && &source_ta.as_ref().unwrap().data.owner != signer.key
        && &source_ta.as_ref().unwrap().data.owner != solauto_position.account_info.key
    {
        msg!("Incorrect {} token account", token_type);
        return Err(SolautoError::IncorrectAccounts.into());
    }

    if !solauto_position.data.self_managed {
        let position = solauto_position.data.position.as_ref().unwrap();

        let mint_data_on_position = if token_type == TokenType::Supply {
            Some(position.protocol_data.supply_mint)
        } else {
            position.protocol_data.debt_mint
        };

        if source_ta.is_some() && mint_data_on_position.is_none() {
            msg!(
                "Provided {} token account when the position does not use this token",
                token_type
            );
            return Err(SolautoError::IncorrectAccounts.into());
        }

        if source_ta.is_some()
            && mint_data_on_position.is_some()
            && source_ta.as_ref().unwrap().data.mint != mint_data_on_position.unwrap()
        {
            msg!("Incorrect {} token account", token_type);
            return Err(SolautoError::IncorrectAccounts.into());
        }
    }

    Ok(())
}

pub fn validate_dca_settings(settings: &Option<DCASettings>) -> ProgramResult {
    if settings.is_none() {
        return Ok(());
    }

    let dca_settings = settings.as_ref().unwrap();
    let invalid_params = |error_msg| {
        msg!(error_msg);
        Err(SolautoError::InvalidDCASettings.into())
    };

    if dca_settings.dca_periods_passed > 0 {
        return invalid_params(
            "DCA periods passed cannot be anything other than 0 when first being set",
        );
    }

    if dca_settings.unix_dca_interval < 60 * 10
        || dca_settings.unix_dca_interval > 60 * 60 * 24 * 30
    {
        return invalid_params("DCA interval period must be between 10 minutes and 1 month");
    }

    if dca_settings.target_dca_periods == 0 {
        return invalid_params("DCA periods must be greater than or equal to 1");
    }

    if dca_settings.dca_direction == DCADirection::Out
        && dca_settings.dca_risk_aversion_bps.is_some()
    {
        return invalid_params("DCA risk aversion BPS parameter is only for when DCAing-in");
    }

    if dca_settings.dca_risk_aversion_bps.is_some()
        && dca_settings.dca_risk_aversion_bps.unwrap() > 10000
    {
        return invalid_params("DCA risk aversion BPS must be between 0 and 10000");
    }

    Ok(())
}
