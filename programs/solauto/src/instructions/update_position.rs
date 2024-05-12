use std::ops::Div;
use solana_program::entrypoint::ProgramResult;

use crate::{
    types::{
        instruction::{
            accounts::{Context, UpdatePositionAccounts},
            UpdatePositionData,
        },
        shared::{
            DeserializedAccount,
            SolautoPosition,
        },
    },
    utils::{
        ix_utils,
        solana_utils,
        solauto_utils,
        validation_utils,
    },
};

pub fn update_position<'a>(
    ctx: Context<UpdatePositionAccounts<'a>>,
    mut solauto_position: DeserializedAccount<'a, SolautoPosition>,
    new_data: UpdatePositionData
) -> ProgramResult {
    if new_data.setting_params.is_some() {
        let position_data = solauto_position.data.position.as_ref().unwrap();
        validation_utils::validate_position_settings(
            &solauto_position,
            (position_data.state.max_ltv_bps as f64).div(10000.0),
            (position_data.state.liq_threshold as f64).div(10000.0)
        )?;
        solauto_position.data.position.as_mut().unwrap().setting_params =
            new_data.setting_params.clone();
    }

    // TODO: what if already an active DCA? Should we fail it? Should we add instruction to close current DCA, or just make
    // necessary modifications to the DCA here?
    if new_data.active_dca.is_some() {
        validation_utils::validate_dca_settings(&new_data.active_dca)?;
        solauto_position.data.position.as_mut().unwrap().active_dca = new_data.active_dca.clone();
        let began_dca_in = solauto_utils::initiate_dca_in_if_necessary(
            ctx.accounts.token_program,
            &mut solauto_position,
            ctx.accounts.position_debt_ta,
            ctx.accounts.signer,
            ctx.accounts.signer_debt_ta
        )?;
        if began_dca_in {
            solauto_position.data.position.as_mut().unwrap().protocol_data.debt_mint = Some(
                *ctx.accounts.debt_mint.unwrap().key
            );

            solana_utils::init_ata_if_needed(
                ctx.accounts.token_program,
                ctx.accounts.system_program,
                ctx.accounts.signer,
                solauto_position.account_info,
                ctx.accounts.position_debt_ta.unwrap(),
                ctx.accounts.debt_mint.unwrap()
            )?;
        }
    }

    ix_utils::update_data(&mut solauto_position)
}
