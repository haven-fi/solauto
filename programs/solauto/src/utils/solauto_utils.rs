use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, msg, program_error::ProgramError,
    program_pack::Pack, pubkey::Pubkey,
};
use spl_associated_token_account::get_associated_token_address;
use spl_token::state::{Account as TokenAccount, Mint};
use std::ops::Div;

use super::{
    math_utils::to_bps,
    solana_utils::{account_has_data, init_account, init_ata_if_needed, spl_token_transfer},
};
use crate::{
    constants::WSOL_MINT,
    state::{
        referral_state::ReferralState,
        solauto_position::{
            DCASettings, PositionData, PositionState, SolautoPosition, SolautoSettingsParameters,
        },
    },
    types::{
        instruction::UpdatePositionData,
        shared::{DeserializedAccount, LendingPlatform, PositionType, SolautoError},
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
    debt_mint: &'a AccountInfo<'a>,
    lending_protocol_account: &'a AccountInfo<'a>,
    max_ltv: f64,
    liq_threshold: f64,
) -> Result<DeserializedAccount<'a, SolautoPosition>, ProgramError> {
    if account_has_data(solauto_position) {
        msg!("Cannot open new position on an existing Solauto position");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    let data = if update_position_data.setting_params.is_some() {
        if update_position_data.position_id == 0 {
            msg!("Position ID 0 is reserved for self-managed positions");
            return Err(ProgramError::InvalidInstructionData.into());
        }

        let supply = DeserializedAccount::<Mint>::unpack(Some(supply_mint))?.unwrap();
        let debt = DeserializedAccount::<Mint>::unpack(Some(debt_mint))?.unwrap();
        let mut state = PositionState::default();
        state.supply.mint = *supply.account_info.key;
        state.supply.decimals = supply.data.decimals;
        state.debt.mint = *debt.account_info.key;
        state.debt.decimals = debt.data.decimals;
        state.max_ltv_bps = to_bps(max_ltv);
        state.liq_threshold_bps = to_bps(liq_threshold);

        let mut position_data = PositionData::default();
        position_data.lending_platform = lending_platform;
        position_data.setting_params =
            SolautoSettingsParameters::from(*update_position_data.setting_params.as_ref().unwrap());
        position_data.protocol_account = *lending_protocol_account.key;
        position_data.supply_mint = *supply_mint.key;
        position_data.debt_mint = *debt_mint.key;

        if update_position_data.dca.is_some() {
            position_data.dca = DCASettings::from(*update_position_data.dca.as_ref().unwrap());
        }

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
    let data: Result<DeserializedAccount<ReferralState>, ProgramError> = if account_has_data(
        referral_state,
    ) {
        let mut referral_state_account =
            DeserializedAccount::<ReferralState>::zerocopy(Some(referral_state))?.unwrap();

        if referred_by_state.is_some() && &referral_state_account.data.referred_by_state == &Pubkey::default() {
            referral_state_account.data.referred_by_state = *referred_by_state.unwrap().key;
        }

        if referral_fees_dest_mint.is_some()
            && referral_fees_dest_mint.as_ref().unwrap()
                != &referral_state_account.data.dest_fees_mint
        {
            referral_state_account.data.dest_fees_mint = *referral_fees_dest_mint.as_ref().unwrap();
        }

        if lookup_table.is_some() && referral_state_account.data.lookup_table == Pubkey::default() {
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
    if referral_state.key != &expected_referral_state_address {
        msg!("Invalid referral position account given for the provided authority");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    Ok(referral_state_account)
}

pub fn initiate_dca_in_if_necessary<'a, 'b>(
    token_program: &'a AccountInfo<'a>,
    solauto_position: &'b mut DeserializedAccount<'a, SolautoPosition>,
    position_debt_ta: Option<&'a AccountInfo<'a>>,
    signer: &'a AccountInfo<'a>,
    signer_dca_ta: Option<&'a AccountInfo<'a>>,
) -> ProgramResult {
    if solauto_position.data.self_managed.val {
        return Ok(());
    }

    let position = &mut solauto_position.data.position;
    if !position.dca.is_active() {
        return Ok(());
    }

    if !position.dca.dca_in() {
        return Ok(());
    }

    if position_debt_ta.is_none() || signer_dca_ta.is_none() {
        msg!("Missing required accounts in order to initiate DCA-in");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    if position_debt_ta.unwrap().key
        != &get_associated_token_address(solauto_position.account_info.key, &position.debt_mint)
    {
        msg!("Incorrect position token account provided");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    let signer_token_account = TokenAccount::unpack(&signer_dca_ta.unwrap().data.borrow())?;
    let balance = signer_token_account.amount;

    if position.dca.dca_in_base_unit > balance {
        msg!("Provided greater DCA-in value than exists in the signer debt token account");
        return Err(ProgramError::InvalidInstructionData.into());
    }

    spl_token_transfer(
        token_program,
        signer_dca_ta.unwrap(),
        signer,
        position_debt_ta.unwrap(),
        position.dca.dca_in_base_unit,
        None,
    )?;

    Ok(())
}

pub fn cancel_dca_in<'a, 'b>(
    signer: &'a AccountInfo<'a>,
    system_program: &'a AccountInfo<'a>,
    token_program: &'a AccountInfo<'a>,
    solauto_position: &'b mut DeserializedAccount<'a, SolautoPosition>,
    dca_mint: Option<&'a AccountInfo<'a>>,
    position_dca_ta: Option<&'a AccountInfo<'a>>,
    signer_dca_ta: Option<&'a AccountInfo<'a>>,
) -> ProgramResult {
    let active_dca = &solauto_position.data.position.dca;

    if active_dca.dca_in() {
        if dca_mint.is_none() || position_dca_ta.is_none() || signer_dca_ta.is_none() {
            msg!(
                "Requires dca_mint, position_dca_ta & signer_dca_ta in order to cancel the active DCA-in"
            );
            return Err(SolautoError::IncorrectAccounts.into());
        }

        let dca_ta_current_balance =
            TokenAccount::unpack(&position_dca_ta.unwrap().data.borrow())?.amount;
        if dca_ta_current_balance == 0 {
            return Ok(());
        }

        init_ata_if_needed(
            token_program,
            system_program,
            signer,
            signer,
            signer_dca_ta.unwrap(),
            dca_mint.unwrap(),
        )?;

        spl_token_transfer(
            token_program,
            position_dca_ta.unwrap(),
            solauto_position.account_info,
            signer_dca_ta.unwrap(),
            dca_ta_current_balance,
            Some(&solauto_position.data.seeds_with_bump()),
        )?;
    }

    solauto_position.data.position.dca = DCASettings::default();
    Ok(())
}

pub struct SolautoFeesBps {
    pub solauto: u16,
    pub referrer: u16,
    pub total: u16,
}
pub fn get_solauto_fees_bps(
    has_been_referred: bool,
    target_liq_utilization_rate_bps: Option<u16>,
    position_net_worth_usd: f64,
) -> SolautoFeesBps {
    let min_size: f64 = 10000.0; // Minimum position size
    let max_size: f64 = 500000.0; // Maximum position size
    let max_fee_bps: f64 = 200.0; // Fee in basis points for min_size (2%)
    let min_fee_bps: f64 = 50.0; // Fee in basis points for max_size (0.5%)
    let k = 1.5;

    let fee_bps: f64;
    if target_liq_utilization_rate_bps.is_some() {
        fee_bps = 25.0;
    } else if position_net_worth_usd <= min_size {
        fee_bps = max_fee_bps;
    } else if position_net_worth_usd >= max_size {
        fee_bps = min_fee_bps;
    } else {
        let t = (position_net_worth_usd.ln() - min_size.ln()) / (max_size.ln() - min_size.ln());
        fee_bps = (min_fee_bps + (max_fee_bps - min_fee_bps) * (1.0 - t.powf(k))).round();
    }

    let referrer_fee = if has_been_referred {
        fee_bps.div(5.0).floor()
    } else {
        0.0
    };

    SolautoFeesBps {
        solauto: (fee_bps - referrer_fee) as u16,
        referrer: referrer_fee as u16,
        total: fee_bps as u16,
    }
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
