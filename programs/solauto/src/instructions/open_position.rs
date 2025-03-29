use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult};

use crate::{
    clients::marginfi::MarginfiClient,
    state::solauto_position::SolautoPosition,
    types::{
        instruction::accounts::{Context, MarginfiOpenPositionAccounts},
        shared::DeserializedAccount,
    },
    utils::*,
};

use self::solana_utils::account_has_data;

pub fn marginfi_open_position<'a>(
    ctx: Context<'a, MarginfiOpenPositionAccounts<'a>>,
    mut solauto_position: DeserializedAccount<'a, SolautoPosition>,
) -> ProgramResult {
    initialize_solauto_position(
        &mut solauto_position,
        ctx.accounts.system_program,
        ctx.accounts.token_program,
        ctx.accounts.rent,
        ctx.accounts.signer,
        ctx.accounts.supply_mint,
        ctx.accounts.position_supply_ta,
        ctx.accounts.debt_mint,
        ctx.accounts.position_debt_ta,
        ctx.accounts.signer_debt_ta,
    )?;

    MarginfiClient::initialize(&ctx, &solauto_position)
}

fn initialize_solauto_position<'a, 'b>(
    solauto_position: &'b mut DeserializedAccount<'a, SolautoPosition>,
    system_program: &'a AccountInfo<'a>,
    token_program: &'a AccountInfo<'a>,
    rent: &'a AccountInfo<'a>,
    signer: &'a AccountInfo<'a>,
    supply_mint: &'a AccountInfo<'a>,
    position_supply_ta: &'a AccountInfo<'a>,
    debt_mint: &'a AccountInfo<'a>,
    position_debt_ta: &'a AccountInfo<'a>,
    signer_debt_ta: Option<&'a AccountInfo<'a>>,
) -> ProgramResult {
    if !solauto_position.data.self_managed.val || !account_has_data(solauto_position.account_info) {
        solana_utils::init_account(
            rent,
            signer,
            solauto_position.account_info,
            &crate::ID,
            Some(solauto_position.data.seeds_with_bump()),
            SolautoPosition::LEN,
        )?;
    }

    solana_utils::init_ata_if_needed(
        token_program,
        system_program,
        signer,
        solauto_position.account_info,
        position_supply_ta,
        supply_mint,
    )?;

    solana_utils::init_ata_if_needed(
        token_program,
        system_program,
        signer,
        solauto_position.account_info,
        position_debt_ta,
        debt_mint,
    )?;

    solauto_utils::initiate_dca_in_if_necessary(
        token_program,
        solauto_position,
        Some(position_debt_ta),
        signer,
        signer_debt_ta,
    )?;

    ix_utils::update_data(solauto_position)
}
