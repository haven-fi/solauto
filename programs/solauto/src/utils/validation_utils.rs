use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};
use crate::types::instruction::accounts::{ Context, SolendProtocolInteractionAccounts };
use crate::types::instruction::ProtocolInteractionArgs;
use crate::types::shared::{
    DeserializedAccount,
    Position,
    ProtocolAction,
    SolautoError,
    SolautoSettingsParameters,
};

use crate::constants::{ FEE_RECEIVER, SOLEND_PROGRAM };

pub fn validate_signer(
    signer: &AccountInfo,
    position_account: &Option<DeserializedAccount<Position>>,
    authority_only_ix: bool
) -> ProgramResult {
    if !signer.is_signer {
        msg!("Signer account is not a signer");
        return Err(ProgramError::MissingRequiredSignature.into());
    }

    if position_account.is_none() {
        return Ok(());
    }

    let position = position_account.as_ref().unwrap();
    let position_authority = position.data.authority;

    if authority_only_ix {
        if signer.key != &position_authority {
            msg!("Authority-only instruction, invalid signer for the specified instruction");
            return Err(ProgramError::InvalidAccountData.into());
        }

        let seeds = &[&[position.data.position_id], signer.key.as_ref()];
        let (pda, _bump) = Pubkey::find_program_address(seeds, &crate::ID);
        if &pda != position.account_info.key {
            msg!("Invalid position specified for the current signer");
            return Err(ProgramError::MissingRequiredSignature.into());
        }
    }

    Ok(())
}

pub fn validate_position_settings(settings: &SolautoSettingsParameters) -> ProgramResult {
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
        if settings.repay_from_bps <= 10000 {
            return invalid_params("repay_from_bps Must be lower or equal to 10000");
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

pub fn validate_solend_accounts(solend_program: &AccountInfo) -> ProgramResult {
    if *solend_program.key != SOLEND_PROGRAM {
        msg!("Incorrect Solend program account");
        return Err(ProgramError::InvalidAccountData.into());
    }
    // We don't need to check more than this, as Solend has it's own account checks and will fail during CPI if there is an issue
    Ok(())
}

pub fn validate_fee_receiver(fee_receiver: &AccountInfo) -> ProgramResult {
    if fee_receiver.key != &FEE_RECEIVER {
        msg!("Fee receiver account must be {}", FEE_RECEIVER);
        return Err(SolautoError::IncorrectFeeReceiver.into());
    }
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

pub fn validate_solend_protocol_interaction_accounts(
    ctx: &Context<SolendProtocolInteractionAccounts>,
    args: &ProtocolInteractionArgs
) -> ProgramResult {
    let require_supply_accounts = || {
        return require_accounts(
            &[
                ctx.accounts.supply_reserve,
                ctx.accounts.supply_reserve_pyth_price_oracle,
                ctx.accounts.supply_reserve_switchboard_oracle,
                ctx.accounts.supply_liquidity_token_mint,
                ctx.accounts.source_supply_liquidity,
                ctx.accounts.reserve_supply_liquidity,
                ctx.accounts.supply_collateral_token_mint,
                ctx.accounts.supply_collateral_token_mint,
                ctx.accounts.source_supply_collateral,
                ctx.accounts.reserve_supply_collateral,
            ]
        );
    };

    let require_debt_accounts = || {
        return require_accounts(
            &[
                ctx.accounts.debt_reserve,
                ctx.accounts.debt_reserve_fee_receiver,
                ctx.accounts.debt_liquidity_token_mint,
                ctx.accounts.source_debt_liquidity,
                ctx.accounts.reserve_debt_liquidity,
            ]
        );
    };

    let require_all_solend_accounts = || -> ProgramResult {
        require_supply_accounts()?;
        require_debt_accounts()?;
        Ok(())
    };

    match &args.action {
        ProtocolAction::Deposit(action_details) => {
            if !action_details.rebalance_utilization_rate_bps.is_none() {
                require_all_solend_accounts()?;
            } else {
                require_supply_accounts()?;
            }
        }
        ProtocolAction::Withdraw(action_details) => {
            if !action_details.rebalance_utilization_rate_bps.is_none() {
                require_all_solend_accounts()?;
            } else {
                require_supply_accounts()?;
            }
        }
        ProtocolAction::Borrow(action_details) => {
            if !action_details.rebalance_utilization_rate_bps.is_none() {
                require_all_solend_accounts()?;
            } else {
                require_debt_accounts()?;
            }
        }
        ProtocolAction::Repay(action_details) => {
            if !action_details.rebalance_utilization_rate_bps.is_none() {
                require_all_solend_accounts()?;
            } else {
                require_debt_accounts()?;
            }
        }
        ProtocolAction::ClosePosition => {
            require_all_solend_accounts()?;
            require_accounts(&[ctx.accounts.positions_manager])?;
        }
    }
    Ok(())
}
