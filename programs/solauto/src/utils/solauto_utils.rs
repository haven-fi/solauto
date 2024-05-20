use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, msg, program_error::ProgramError,
    program_pack::Pack, pubkey::Pubkey,
};
use spl_associated_token_account::get_associated_token_address;
use spl_token::state::Account as TokenAccount;
use std::ops::Mul;

use super::solana_utils::{account_has_data, init_account, init_ata_if_needed, spl_token_transfer};
use crate::{
    constants::{REFERRER_FEE_SPLIT, SOLAUTO_FEES_WALLET, WSOL_MINT},
    types::{
        instruction::UpdatePositionData,
        shared::{
            DeserializedAccount, LendingPlatform, LendingProtocolPositionData, PositionData,
            PositionState, ReferralStateAccount, SolautoError, SolautoPosition,
        },
    },
};

pub fn get_owner<'a, 'b>(
    solauto_position: &'b DeserializedAccount<'a, SolautoPosition>,
    signer: &'a AccountInfo<'a>,
) -> &'a AccountInfo<'a> {
    if solauto_position.data.self_managed {
        signer
    } else {
        solauto_position.account_info
    }
}

pub fn create_new_solauto_position<'a>(
    signer: &AccountInfo<'a>,
    solauto_position: &'a AccountInfo<'a>,
    update_position_data: UpdatePositionData,
    lending_platform: LendingPlatform,
    supply_mint: &'a AccountInfo<'a>,
    debt_mint: Option<&'a AccountInfo<'a>>,
    lending_protocol_account: &'a AccountInfo<'a>,
    max_ltv: Option<f64>,
    liq_threshold: Option<f64>,
) -> Result<DeserializedAccount<'a, SolautoPosition>, ProgramError> {
    let data = if update_position_data.setting_params.is_some() {
        if update_position_data.position_id == 0 {
            msg!("Position ID 0 is reserved for self-managed positions");
            return Err(ProgramError::InvalidInstructionData.into());
        }

        if account_has_data(solauto_position) {
            msg!("Cannot use open position instruction on an existing Solauto position");
            return Err(SolautoError::IncorrectAccounts.into());
        }

        let mut state = PositionState::default();
        if max_ltv.is_some() {
            state.max_ltv_bps = Some(max_ltv.unwrap().mul(10000.0) as u16);
        }
        if liq_threshold.is_some() {
            state.liq_threshold_bps = liq_threshold.unwrap().mul(10000.0) as u16;
        }

        SolautoPosition::new(
            update_position_data.position_id,
            *signer.key,
            Some(PositionData {
                setting_params: update_position_data.setting_params.clone(),
                state,
                lending_platform,
                protocol_data: LendingProtocolPositionData {
                    protocol_account: lending_protocol_account.key.clone(),
                    supply_mint: supply_mint.key.clone(),
                    debt_mint: debt_mint.map_or_else(|| None, |mint| Some(mint.key.clone())),
                },
                active_dca: update_position_data.active_dca.clone(),
                debt_ta_balance: 0,
            }),
        )
    } else {
        SolautoPosition::new(0, *signer.key, None)
    };

    Ok(DeserializedAccount::<SolautoPosition> {
        account_info: solauto_position,
        data: Box::new(data),
    })
}

pub fn create_or_update_referral_state<'a>(
    rent: &'a AccountInfo<'a>,
    signer: &'a AccountInfo<'a>,
    authority: &'a AccountInfo<'a>,
    referral_state: &'a AccountInfo<'a>,
    referral_fees_dest_mint: Option<Pubkey>,
    referred_by_state: Option<&'a AccountInfo<'a>>,
) -> Result<DeserializedAccount<'a, ReferralStateAccount>, ProgramError> {
    let referral_state_seeds = ReferralStateAccount::seeds(authority.key);
    let (referral_state_pda, _) =
        Pubkey::find_program_address(referral_state_seeds.as_slice(), &crate::ID);
    if &referral_state_pda != referral_state.key {
        msg!("Invalid referral position account given for the provided authority");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    if account_has_data(referral_state) {
        let mut referral_state_account =
            DeserializedAccount::<ReferralStateAccount>::deserialize(Some(referral_state))?
                .unwrap();

        if referral_state_account.data.referred_by_state.is_none() && referred_by_state.is_some() {
            referral_state_account.data.referred_by_state =
                Some(referred_by_state.unwrap().key.clone());
        }

        if referral_fees_dest_mint.is_some()
            && referral_fees_dest_mint.as_ref().unwrap()
                != &referral_state_account.data.dest_fees_mint
        {
            referral_state_account.data.dest_fees_mint = referral_fees_dest_mint.unwrap().clone();
        }

        Ok(referral_state_account)
    } else {
        let dest_mint = if referral_fees_dest_mint.is_some() {
            referral_fees_dest_mint.as_ref().unwrap()
        } else {
            &WSOL_MINT
        };

        let data = Box::new(ReferralStateAccount::new(
            *authority.key,
            referred_by_state.map_or(None, |r| Some(r.key.clone())),
            *dest_mint,
        ));

        init_account(
            rent,
            signer,
            referral_state,
            &crate::ID,
            Some(data.seeds_with_bump()),
            ReferralStateAccount::LEN,
        )?;

        Ok(DeserializedAccount {
            account_info: referral_state,
            data,
        })
    }
}

pub fn init_solauto_fees_supply_ta<'a>(
    token_program: &'a AccountInfo<'a>,
    system_program: &'a AccountInfo<'a>,
    signer: &'a AccountInfo<'a>,
    solauto_fees_wallet: &'a AccountInfo<'a>,
    solauto_fees_supply_ta: &'a AccountInfo<'a>,
    supply_mint: &'a AccountInfo<'a>,
) -> ProgramResult {
    if solauto_fees_wallet.key != &SOLAUTO_FEES_WALLET {
        return Err(SolautoError::IncorrectAccounts.into());
    }
    init_ata_if_needed(
        token_program,
        system_program,
        signer,
        solauto_fees_wallet,
        solauto_fees_supply_ta,
        supply_mint,
    )
}

pub fn initiate_dca_in_if_necessary<'a, 'b>(
    token_program: &'a AccountInfo<'a>,
    solauto_position: &'b mut DeserializedAccount<'a, SolautoPosition>,
    position_debt_ta: Option<&'a AccountInfo<'a>>,
    signer: &'a AccountInfo<'a>,
    signer_debt_ta: Option<&'a AccountInfo<'a>>,
) -> ProgramResult {
    if solauto_position.data.self_managed {
        return Ok(());
    }

    let position = solauto_position.data.position.as_mut().unwrap();
    if position.active_dca.is_none() {
        return Ok(());
    }

    let active_dca = position.active_dca.as_ref().unwrap();
    if active_dca.add_to_pos.is_none() {
        return Ok(());
    }

    if position_debt_ta.is_none() || signer_debt_ta.is_none() {
        msg!("Missing required accounts in order to initiate DCA-in");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    if position_debt_ta.unwrap().key
        != &get_associated_token_address(
            solauto_position.account_info.key,
            position.protocol_data.debt_mint.as_ref().unwrap(),
        )
    {
        msg!("Incorrect position token account provided");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    let base_unit_amount_to_add = active_dca
        .add_to_pos
        .as_ref()
        .unwrap()
        .base_unit_debt_amount;
    let signer_token_account = TokenAccount::unpack(&signer_debt_ta.unwrap().data.borrow())?;
    let balance = signer_token_account.amount;

    if base_unit_amount_to_add > balance {
        msg!("Provided greater DCA-in value than exists in the signer debt token account");
        return Err(ProgramError::InvalidInstructionData.into());
    }

    position.debt_ta_balance += base_unit_amount_to_add;
    spl_token_transfer(
        token_program,
        signer_debt_ta.unwrap(),
        signer,
        position_debt_ta.unwrap(),
        base_unit_amount_to_add,
        None,
    )?;

    Ok(())
}

pub fn cancel_dca_in_if_necessary<'a, 'b>(
    signer: &'a AccountInfo<'a>,
    system_program: &'a AccountInfo<'a>,
    token_program: &'a AccountInfo<'a>,
    solauto_position: &'b mut DeserializedAccount<'a, SolautoPosition>,
    debt_mint: Option<&'a AccountInfo<'a>>,
    position_debt_ta: Option<&'a AccountInfo<'a>>,
    signer_debt_ta: Option<&'a AccountInfo<'a>>,
) -> ProgramResult {
    let active_dca = solauto_position
        .data
        .position
        .as_ref()
        .unwrap()
        .active_dca
        .as_ref()
        .unwrap();

    if active_dca.add_to_pos.is_some()
        && solauto_position
            .data
            .position
            .as_ref()
            .unwrap()
            .debt_ta_balance
            > 0
    {
        if debt_mint.is_none() || position_debt_ta.is_none() || signer_debt_ta.is_none() {
            msg!(
                "Requires debt_mint, position_debt_ta & signer_debt_ta in order to cancel the active DCA-in"
            );
            return Err(SolautoError::IncorrectAccounts.into());
        }

        let debt_ta_current_balance =
            TokenAccount::unpack(&position_debt_ta.unwrap().data.borrow())?.amount;
        if debt_ta_current_balance == 0 {
            return Ok(());
        }

        init_ata_if_needed(
            token_program,
            system_program,
            signer,
            signer,
            signer_debt_ta.unwrap(),
            debt_mint.unwrap(),
        )?;

        solauto_position
            .data
            .position
            .as_mut()
            .unwrap()
            .debt_ta_balance = 0;

        spl_token_transfer(
            token_program,
            position_debt_ta.unwrap(),
            solauto_position.account_info,
            signer_debt_ta.unwrap(),
            debt_ta_current_balance,
            Some(&solauto_position.data.seeds_with_bump()),
        )?;
    }

    solauto_position.data.position.as_mut().unwrap().active_dca = None;
    Ok(())
}

pub struct SolautoFeesBps {
    pub solauto: u16,
    pub referrer: u16,
    pub total: u16,
}
impl SolautoFeesBps {
    pub fn get(has_been_referred: bool) -> Self {
        let solauto = 100;
        let referrer = if has_been_referred {
            ((solauto as f64) * REFERRER_FEE_SPLIT) as u16
        } else {
            0
        };

        Self {
            solauto,
            referrer,
            total: solauto + referrer,
        }
    }
}
