use solana_program::{ entrypoint::ProgramResult, msg };

use crate::{
    types::{
        instruction::{ accounts::{ Context, UpdatePositionAccounts }, UpdatePositionData },
        shared::{ DCADirection, DeserializedAccount, SolautoError, SolautoPosition },
    },
    utils::{ ix_utils, solana_utils, solauto_utils, validation_utils },
};

pub fn update_position<'a>(
    ctx: Context<UpdatePositionAccounts<'a>>,
    mut solauto_position: DeserializedAccount<'a, SolautoPosition>,
    new_data: UpdatePositionData
) -> ProgramResult {
    msg!("Hello 1");
    if new_data.setting_params.is_some() {
        update_settings(&mut solauto_position, &new_data)?;
    }
    msg!("Hello 2");

    if new_data.active_dca.is_some() {
        update_dca(&ctx, &mut solauto_position, &new_data)?;
    }

    msg!("Hello 3");

    ix_utils::update_data(&mut solauto_position)
}

fn update_settings(
    solauto_position: &mut DeserializedAccount<SolautoPosition>,
    new_data: &UpdatePositionData
) -> ProgramResult {
    let position_data = solauto_position.data.position.as_ref().unwrap();
    
    if
        position_data.active_dca.is_some() &&
        (position_data.active_dca.as_ref().unwrap().target_boost_to_bps.is_some() ||
            position_data.active_dca.as_ref().unwrap().dca_direction == DCADirection::Out)
    {
        msg!(
            "Cannot modify position settings when there is a current on-going DCA. Cancel active DCA first."
        );
        return Err(SolautoError::InvalidPositionSettings.into());
    }

    validation_utils::validate_position_settings(&solauto_position)?;
    solauto_position.data.position.as_mut().unwrap().setting_params =
        new_data.setting_params.clone();

    Ok(())
}

fn update_dca<'a, 'b>(
    ctx: &'b Context<UpdatePositionAccounts<'a>>,
    solauto_position: &'b mut DeserializedAccount<'a, SolautoPosition>,
    new_data: &'b UpdatePositionData
) -> ProgramResult {
    let new_dca = new_data.active_dca.as_ref().unwrap();

    msg!("Hello .1");

    if solauto_position.data.position.as_ref().unwrap().active_dca.is_some() {
        let current_direction = solauto_position.data.position
            .as_ref()
            .unwrap()
            .active_dca.as_ref()
            .unwrap().dca_direction;
        if let DCADirection::In(_) = current_direction {
            if
                new_dca.dca_direction == DCADirection::Out &&
                solauto_position.data.position.as_ref().unwrap().debt_ta_balance > 0
            {
                solauto_utils::cancel_active_dca(
                    ctx.accounts.signer,
                    ctx.accounts.system_program,
                    ctx.accounts.token_program,
                    solauto_position,
                    ctx.accounts.debt_mint,
                    ctx.accounts.position_debt_ta,
                    ctx.accounts.signer_debt_ta
                )?;
            }
        }
    }

    msg!("Hello .2");

    let position_data = solauto_position.data.position.as_mut().unwrap();
    validation_utils::validate_dca_settings(&position_data)?;
    position_data.active_dca = new_data.active_dca.clone();

    msg!("Hello .3");

    if let DCADirection::In(_) = new_dca.dca_direction {
        if
            position_data.protocol_data.debt_mint.is_some() &&
            position_data.protocol_data.debt_mint.unwrap() !=
                *ctx.accounts.debt_mint.unwrap().key
        {
            msg!(
                "Cannot change debt token on an active Solauto position that currently has debt"
            );
            return Err(SolautoError::IncorrectAccounts.into());
        }
        position_data.protocol_data.debt_mint = Some(*ctx.accounts.debt_mint.unwrap().key);

        msg!("Hello .5");

        solana_utils::init_ata_if_needed(
            ctx.accounts.token_program,
            ctx.accounts.system_program,
            ctx.accounts.signer,
            solauto_position.account_info,
            ctx.accounts.position_debt_ta.unwrap(),
            ctx.accounts.debt_mint.unwrap()
        )?;

        msg!("Hello .6");

        solauto_utils::initiate_dca_in_if_necessary(
            ctx.accounts.token_program,
            solauto_position,
            ctx.accounts.position_debt_ta,
            ctx.accounts.signer,
            ctx.accounts.signer_debt_ta
        )?;

        msg!("Hello .7");

    }


    Ok(())
}