use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::instructions::ID as ixs_sysvar_id,
};
use spl_associated_token_account::get_associated_token_address;

use crate::{
    constants::SOLAUTO_MANAGER,
    types::{
        instruction::{
            accounts::{
                Context,
                MarginfiProtocolInteractionAccounts,
                SolendProtocolInteractionAccounts,
            },
            SolautoAction,
            SolautoStandardAccounts,
        },
        shared::{
            DeserializedAccount,
            LendingPlatform,
            Position,
            SolautoError,
            SolautoSettingsParameters,
        },
    },
};

use crate::constants::{ KAMINO_PROGRAM, MARGINFI_PROGRAM, SOLEND_PROGRAM };
use super::math_utils::get_maximum_repay_to_bps_param;

pub fn generic_instruction_validation(
    accounts: &SolautoStandardAccounts,
    authority_only_ix: bool,
    lending_platform: LendingPlatform,
    supply_token_mint: Option<&AccountInfo>
) -> ProgramResult {
    validate_signer(accounts.signer, &accounts.solauto_position, authority_only_ix)?;
    validate_program_account(accounts.lending_protocol, lending_platform)?;

    if !supply_token_mint.is_none() {
        validate_referral_accounts(accounts, supply_token_mint.unwrap())?;

        if
            !accounts.solauto_fees_supply_ta.is_none() &&
            accounts.solauto_fees_supply_ta.unwrap().key !=
                &get_associated_token_address(&SOLAUTO_MANAGER, supply_token_mint.unwrap().key)
        {
            return Err(SolautoError::IncorrectFeesReceiverAccount.into());
        }
    }

    if !accounts.ixs_sysvar.is_none() && accounts.ixs_sysvar.unwrap().key != &ixs_sysvar_id {
        msg!("Incorrect ixs sysvar account provided");
        return Err(ProgramError::InvalidAccountData.into());
    }
    // We don't need to check other standard variables as shank handles system_program, token_program, ata_program, & rent
    // TODO verify the above comment with a test by providing a different account in place of rent account (instruction should fail)

    Ok(())
}

pub fn validate_signer(
    signer: &AccountInfo,
    solauto_position: &DeserializedAccount<Position>,
    authority_only_ix: bool
) -> ProgramResult {
    if !signer.is_signer {
        msg!("Signer account is not a signer");
        return Err(ProgramError::MissingRequiredSignature.into());
    }

    let position_authority = solauto_position.data.authority;

    if authority_only_ix {
        if signer.key != &position_authority {
            msg!("Authority-only instruction, invalid signer for the specified instruction & Solauto position");
            return Err(ProgramError::InvalidAccountData.into());
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
    settings: &SolautoSettingsParameters,
    max_ltv: f64,
    liq_threshold: f64
) -> ProgramResult {
    let invalid_params = |error_msg| {
        msg!(error_msg);
        Err(SolautoError::InvalidPositionSettings.into())
    };

    if
        settings.repay_from_bps != 0 &&
        settings.repay_to_bps != 0 &&
        settings.boost_from_bps != 0 &&
        settings.boost_to_bps != 0
    {
        if settings.repay_from_bps <= settings.repay_to_bps {
            return invalid_params("repay_from_bps value must be greater than repay_to_bps value");
        }
        if settings.boost_from_bps >= settings.boost_to_bps {
            return invalid_params("boost_from_bps value must be less than boost_to_bps value");
        }
        if settings.repay_from_bps - settings.repay_to_bps < 50 {
            return invalid_params(
                "Minimum difference between repay_from_bps and repay_to_bps must be 50 or greater"
            );
        }
        if settings.boost_to_bps - settings.boost_from_bps < 50 {
            return invalid_params(
                "Minimum difference between boost_to_bps to boost_from_bps must be 50 or greater"
            );
        }
        if settings.repay_from_bps > 9500 {
            return invalid_params("repay_from_bps must be lower or equal to 9500");
        }

        let maximum_repay_to_bps = get_maximum_repay_to_bps_param(max_ltv, liq_threshold);
        if settings.repay_to_bps > maximum_repay_to_bps {
            return invalid_params(
                format!("For the given max_ltv and liq_threshold of the supplied asset, repay_to_bps must be lower or equal to {} in order to bring the utilization rate to an allowed position", maximum_repay_to_bps).as_str()
            );
        }
    } else {
        let params = vec![
            settings.repay_from_bps,
            settings.repay_to_bps,
            settings.boost_from_bps,
            settings.boost_to_bps
        ];
        if params.iter().any(|&x| x != 0) {
            return invalid_params("Either all setting parameters should be 0, or none");
        }
    }

    Ok(())
}

pub fn validate_program_account(
    program: &AccountInfo,
    lending_platform: LendingPlatform
) -> ProgramResult {
    match lending_platform {
        LendingPlatform::Solend => {
            if *program.key != SOLEND_PROGRAM {
                msg!("Incorrect Solend program account");
                return Err(ProgramError::InvalidAccountData.into());
            }
        }
        LendingPlatform::Marginfi => {
            if *program.key != MARGINFI_PROGRAM {
                msg!("Incorrect Marginfi program account");
                return Err(ProgramError::InvalidAccountData.into());
            }
        }
        LendingPlatform::Kamino => {
            if *program.key != KAMINO_PROGRAM {
                msg!("Incorrect Kamino program account");
                return Err(ProgramError::InvalidAccountData.into());
            }
        }
    }
    // We don't need to check more than this, as lending protocols have their own account checks and will fail during CPI if there is an issue with the provided accounts
    Ok(())
}

pub fn require_accounts(accounts: &[Option<&AccountInfo>]) -> ProgramResult {
    for acc in accounts.into_iter() {
        if acc.is_none() {
            return Err(SolautoError::MissingRequiredAccounts.into());
        }
    }
    Ok(())
}

pub fn validate_marginfi_protocol_interaction_ix(
    ctx: &Context<MarginfiProtocolInteractionAccounts>,
    action: &SolautoAction
) -> ProgramResult {
    let require_supply_accounts = || {
        return require_accounts(
            &(
                [
                    // TODO
                ]
            )
        );
    };

    let require_debt_accounts = || {
        return require_accounts(
            &(
                [
                    // TODO
                ]
            )
        );
    };

    match action {
        SolautoAction::Deposit(_) => {
            require_supply_accounts()?;
        }
        SolautoAction::Withdraw(_) => {
            require_supply_accounts()?;
        }
        SolautoAction::Borrow(_) => {
            require_debt_accounts()?;
        }
        SolautoAction::Repay(_) => {
            require_debt_accounts()?;
        }
    }

    Ok(())
}

pub fn validate_solend_protocol_interaction_ix(
    ctx: &Context<SolendProtocolInteractionAccounts>,
    action: &SolautoAction
) -> ProgramResult {
    let require_supply_accounts = || {
        return require_accounts(
            &[
                ctx.accounts.supply_reserve,
                ctx.accounts.supply_reserve_pyth_price_oracle,
                ctx.accounts.supply_reserve_switchboard_oracle,
                ctx.accounts.supply_liquidity_mint,
                ctx.accounts.authority_supply_liquidity_ta,
                ctx.accounts.reserve_supply_liquidity_ta,
                ctx.accounts.supply_collateral_mint,
                ctx.accounts.supply_collateral_mint,
                ctx.accounts.authority_supply_collateral_ta,
                ctx.accounts.reserve_supply_collateral_ta,
            ]
        );
    };

    let require_debt_accounts = || {
        return require_accounts(
            &[
                ctx.accounts.debt_reserve,
                ctx.accounts.debt_reserve_fee_receiver_ta,
                ctx.accounts.debt_liquidity_mint,
                ctx.accounts.authority_debt_liquidity_ta,
                ctx.accounts.reserve_debt_liquidity_ta,
            ]
        );
    };

    match action {
        SolautoAction::Deposit(_) => {
            require_supply_accounts()?;
        }
        SolautoAction::Withdraw(_) => {
            require_supply_accounts()?;
        }
        SolautoAction::Borrow(_) => {
            require_debt_accounts()?;
        }
        SolautoAction::Repay(_) => {
            require_debt_accounts()?;
        }
    }

    Ok(())
}

pub fn validate_referral_accounts(
    std_accounts: &SolautoStandardAccounts,
    supply_token_mint: &AccountInfo
) -> ProgramResult {
    if std_accounts.authority_referral_state.is_none() {
        return Ok(());
    }

    let referral_state_seeds = &[
        std_accounts.solauto_position.data.authority.as_ref(),
        b"referral_state",
    ];
    let (referral_state_pda, _bump) = Pubkey::find_program_address(
        referral_state_seeds,
        &crate::ID
    );
    if
        &referral_state_pda !=
        std_accounts.authority_referral_state.as_ref().unwrap().account_info.key
    {
        msg!("Invalid referral position account given for the provided authority");
        return Err(ProgramError::InvalidAccountData.into());
    }

    let referred_by_state = std_accounts.authority_referral_state
        .as_ref()
        .unwrap().data.referred_by_state;

    if !referred_by_state.is_none() && std_accounts.referred_by_state.is_none() {
        msg!(
            "Missing referred_by_state account when the authority referral state has been referred"
        );
        return Err(ProgramError::InvalidAccountData.into());
    }

    if
        std_accounts.referred_by_supply_ta.is_none() ||
        std_accounts.referred_by_supply_ta.unwrap().key !=
            &get_associated_token_address(&referred_by_state.unwrap(), supply_token_mint.key)
    {
        msg!(
            "Provided incorrect referred_by_supply_ta according to the given authority and token mint"
        );
        return Err(ProgramError::InvalidAccountData.into());
    }

    Ok(())
}

pub fn validate_source_token_account(
    std_accounts: &SolautoStandardAccounts,
    source_ta: &AccountInfo,
    token_mint: &AccountInfo
) -> ProgramResult {
    if
        source_ta.key !=
            &get_associated_token_address(
                std_accounts.solauto_position.account_info.key,
                token_mint.key
            ) &&
        source_ta.key != &get_associated_token_address(std_accounts.signer.key, token_mint.key)
    {
        msg!("Invalid source token account provided for the given solauto position & token mint");
        return Err(ProgramError::InvalidAccountData.into());
    }
    Ok(())
}

pub fn validate_lending_protocol_accounts(
    solauto_position: &DeserializedAccount<Position>,
    protocol_position: &AccountInfo,
    supply_mint: &AccountInfo,
    debt_mint: Option<&AccountInfo>
) -> ProgramResult {
    if !solauto_position.data.self_managed {
        let protocol_data = solauto_position.data.position
            .as_ref()
            .unwrap()
            .protocol_data.as_ref()
            .unwrap();

        if protocol_position.key != &protocol_data.protocol_position {
            msg!("Incorrect protocol-owned account");
            return Err(SolautoError::InvalidSolautoPositionAccount.into());
        }

        if supply_mint.key != &protocol_data.supply_mint {
            msg!("Incorrect supply mint account");
            return Err(SolautoError::InvalidSolautoPositionAccount.into());
        }

        if
            !debt_mint.is_none() &&
            !protocol_data.debt_mint.is_none() &&
            debt_mint.unwrap().key != &protocol_data.debt_mint.unwrap()
        {
            msg!("Incorrect debt mint account");
            return Err(SolautoError::InvalidSolautoPositionAccount.into());
        }
    }

    Ok(())
}
