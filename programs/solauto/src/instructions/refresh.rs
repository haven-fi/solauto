use marginfi_sdk::generated::accounts::MarginfiAccount;
use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, sysvar::Sysvar,
};

use crate::{
    clients::marginfi::MarginfiClient,
    state::solauto_position::SolautoPosition,
    types::{shared::DeserializedAccount, solauto_manager::SolautoManager},
    utils::ix_utils,
};

pub fn marginfi_refresh_accounts<'a, 'b>(
    marginfi_program: &'a AccountInfo<'a>,
    marginfi_group: &'a AccountInfo<'a>,
    marginfi_account: &'a AccountInfo<'a>,
    supply_bank: &'a AccountInfo<'a>,
    supply_price_oracle: &'a AccountInfo<'a>,
    debt_bank: &'a AccountInfo<'a>,
    debt_price_oracle: &'a AccountInfo<'a>,
    solauto_position: &'b mut DeserializedAccount<SolautoPosition>,
) -> ProgramResult {
    MarginfiClient::refresh_bank(marginfi_program, marginfi_group, supply_bank)?;
    MarginfiClient::refresh_bank(marginfi_program, marginfi_group, debt_bank)?;

    let marginfi_account =
        DeserializedAccount::<MarginfiAccount>::zerocopy(Some(marginfi_account))?.unwrap();

    let updated_state = MarginfiClient::get_updated_state(
        &marginfi_account,
        supply_bank,
        supply_price_oracle,
        debt_bank,
        debt_price_oracle,
    )?;

    SolautoManager::refresh_position(&mut solauto_position.data, updated_state, Clock::get()?)?;
    ix_utils::update_data(solauto_position)
}
