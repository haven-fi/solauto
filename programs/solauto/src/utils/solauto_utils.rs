use solana_program::{
    account_info::AccountInfo, clock::Clock, program_error::ProgramError, pubkey::Pubkey,
    sysvar::Sysvar,
};
use spl_token::state::{Account as TokenAccount, Mint};

use super::{
    math_utils::to_bps,
    solana_utils::{account_has_data, init_account},
};
use crate::{
    check,
    constants::WSOL_MINT,
    state::{
        referral_state::ReferralState,
        solauto_position::{
            PositionData, PositionState, PositionTokenState, SolautoPosition,
            SolautoSettingsParameters,
        },
    },
    types::{
        errors::SolautoError,
        instruction::UpdatePositionData,
        shared::{DeserializedAccount, LendingPlatform, PositionType, RefreshedTokenState},
    },
};

pub fn get_owner<'a, 'b>(
    solauto_position: &'b DeserializedAccount<'a, SolautoPosition>,
    signer: &'a AccountInfo<'a>,
) -> &'a AccountInfo<'a> {
    if solauto_position.data.self_managed.val {
        signer
    } else {
        solauto_position.account_info
    }
}

pub fn create_new_solauto_position<'a>(
    signer: &AccountInfo<'a>,
    solauto_position: &'a AccountInfo<'a>,
    position_type: PositionType,
    update_position_data: UpdatePositionData,
    lending_platform: LendingPlatform,
    supply_mint: &'a AccountInfo<'a>,
    lp_supply_account: &'a AccountInfo<'a>,
    debt_mint: &'a AccountInfo<'a>,
    lp_debt_account: &'a AccountInfo<'a>,
    lp_user_account: &'a AccountInfo<'a>,
    lp_pool_account: &'a AccountInfo<'a>,
    max_ltv: f64,
    liq_threshold: f64,
) -> Result<DeserializedAccount<'a, SolautoPosition>, ProgramError> {
    check!(
        !account_has_data(solauto_position),
        SolautoError::IncorrectAccounts
    );

    let data = if update_position_data.settings.is_some() {
        check!(
            update_position_data.position_id > 0,
            SolautoError::IncorrectInstructions
        );

        let supply = DeserializedAccount::<Mint>::unpack(Some(supply_mint))?.unwrap();
        let debt = DeserializedAccount::<Mint>::unpack(Some(debt_mint))?.unwrap();
        let mut state = PositionState::default();
        state.supply.mint = *supply.account_info.key;
        state.supply.decimals = supply.data.decimals;
        state.debt.mint = *debt.account_info.key;
        state.debt.decimals = debt.data.decimals;
        state.max_ltv_bps = to_bps(max_ltv);
        state.liq_threshold_bps = to_bps(liq_threshold);
        state.last_refreshed = Clock::get()?.unix_timestamp as u64;

        let mut position_data = PositionData::default();
        position_data.lending_platform = lending_platform;
        position_data.settings =
            SolautoSettingsParameters::from(*update_position_data.settings.as_ref().unwrap());
        position_data.lp_user_account = *lp_user_account.key;
        position_data.lp_supply_account = *lp_supply_account.key;
        position_data.lp_debt_account = *lp_debt_account.key;
        position_data.lp_pool_account = *lp_pool_account.key;

        Box::new(SolautoPosition::new(
            update_position_data.position_id,
            *signer.key,
            position_type,
            position_data,
            state,
        ))
    } else {
        Box::new(SolautoPosition::new(
            0,
            *signer.key,
            position_type,
            PositionData::default(),
            PositionState::default(),
        ))
    };

    Ok(DeserializedAccount::<SolautoPosition> {
        account_info: solauto_position,
        data,
    })
}

pub fn create_or_update_referral_state<'a>(
    rent: &'a AccountInfo<'a>,
    signer: &'a AccountInfo<'a>,
    authority: &'a AccountInfo<'a>,
    referral_state: &'a AccountInfo<'a>,
    referral_fees_dest_mint: Option<Pubkey>,
    referred_by_state: Option<&'a AccountInfo<'a>>,
    lookup_table: Option<Pubkey>,
) -> Result<DeserializedAccount<'a, ReferralState>, ProgramError> {
    let data: Result<DeserializedAccount<ReferralState>, ProgramError> =
        if account_has_data(referral_state) {
            let mut referral_state_account =
                DeserializedAccount::<ReferralState>::zerocopy(Some(referral_state))?.unwrap();

            if referred_by_state.is_some()
                && &referral_state_account.data.referred_by_state == &Pubkey::default()
            {
                referral_state_account.data.referred_by_state = *referred_by_state.unwrap().key;
            }

            if referral_fees_dest_mint.is_some()
                && referral_fees_dest_mint.as_ref().unwrap()
                    != &referral_state_account.data.dest_fees_mint
            {
                referral_state_account.data.dest_fees_mint =
                    *referral_fees_dest_mint.as_ref().unwrap();
            }

            if lookup_table.is_some()
                && referral_state_account.data.lookup_table == Pubkey::default()
            {
                referral_state_account.data.lookup_table = lookup_table.unwrap();
            }

            Ok(referral_state_account)
        } else {
            let dest_mint = if referral_fees_dest_mint.is_some() {
                referral_fees_dest_mint.as_ref().unwrap()
            } else {
                &WSOL_MINT
            };

            let data = Box::new(ReferralState::new(
                *authority.key,
                referred_by_state.map_or(Pubkey::default(), |r| *r.key),
                *dest_mint,
                lookup_table,
            ));

            init_account(
                rent,
                signer,
                referral_state,
                &crate::ID,
                Some(data.seeds_with_bump()),
                ReferralState::LEN,
            )?;

            Ok(DeserializedAccount {
                account_info: referral_state,
                data,
            })
        };

    let referral_state_account = data.unwrap();

    let expected_referral_state_address = Pubkey::create_program_address(
        referral_state_account.data.seeds_with_bump().as_slice(),
        &crate::ID,
    )?;
    check!(
        referral_state.key == &expected_referral_state_address,
        SolautoError::IncorrectAccounts
    );

    Ok(referral_state_account)
}

pub fn update_token_state(token_state: &mut PositionTokenState, token_data: &RefreshedTokenState) {
    token_state.decimals = token_data.decimals;
    token_state.amount_used.base_unit = token_data.amount_used;
    token_state.amount_can_be_used.base_unit = token_data.amount_can_be_used;
    token_state.update_market_price(token_data.market_price);
    token_state.borrow_fee_bps = token_data.borrow_fee_bps.unwrap_or(0);
}

pub fn safe_unpack_token_account<'a>(
    account: Option<&'a AccountInfo<'a>>,
) -> Result<Option<DeserializedAccount<'a, TokenAccount>>, ProgramError> {
    if account.is_some() && account_has_data(account.unwrap()) {
        DeserializedAccount::<TokenAccount>::unpack(account)
            .map_err(|_| ProgramError::InvalidAccountData)
    } else {
        Ok(None)
    }
}
