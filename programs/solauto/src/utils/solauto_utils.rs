use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, msg, program_error::ProgramError,
    program_pack::Pack, pubkey::Pubkey,
};
use spl_associated_token_account::get_associated_token_address;
use spl_token::state::Account as TokenAccount;
use std::ops::{Add, Mul};

use super::solana_utils::{account_has_data, init_account, init_ata_if_needed, spl_token_transfer};
use crate::{
    constants::{REFERRER_FEE_SPLIT, SOLAUTO_FEES_WALLET, WSOL_MINT},
    types::{
        instruction::UpdatePositionData,
        obligation_position::LendingProtocolObligationPosition,
        shared::{
            DCADirection, DeserializedAccount, LendingPlatform, LendingProtocolPositionData,
            PositionData, PositionState, ReferralStateAccount, SolautoError, SolautoPosition,
            REFERRAL_ACCOUNT_SPACE,
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

        SolautoPosition::new(
            update_position_data.position_id,
            *signer.key,
            Some(PositionData {
                setting_params: update_position_data.setting_params.clone(),
                state: PositionState::default(),
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
    system_program: &'a AccountInfo<'a>,
    rent: &'a AccountInfo<'a>,
    signer: &'a AccountInfo<'a>,
    authority: &'a AccountInfo<'a>,
    referral_state: &'a AccountInfo<'a>,
    referral_fees_dest_mint: Option<Pubkey>,
    referred_by_state: Option<&'a AccountInfo<'a>>,
) -> Result<DeserializedAccount<'a, ReferralStateAccount>, ProgramError> {
    let referral_state_seeds = get_referral_account_seeds(authority.key);
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
        init_account(
            system_program,
            rent,
            signer,
            referral_state,
            &crate::ID,
            Some(referral_state_seeds[..].to_vec()),
            REFERRAL_ACCOUNT_SPACE,
        )?;

        let dest_mint = if referral_fees_dest_mint.is_some() {
            referral_fees_dest_mint.as_ref().unwrap()
        } else {
            &WSOL_MINT
        };

        let data = Box::new(ReferralStateAccount {
            authority: *authority.key,
            referred_by_state: referred_by_state.map_or(None, |r| Some(r.key.clone())),
            dest_fees_mint: *dest_mint,
        });

        let deserialized_account = DeserializedAccount {
            account_info: referral_state,
            data,
        };

        Ok(deserialized_account)
    }
}

pub fn get_referral_account_seeds<'a>(authority: &'a Pubkey) -> Vec<&[u8]> {
    vec![authority.as_ref(), b"referral_state"]
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
    if active_dca.dca_direction == DCADirection::Out {
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

    let signer_token_account = TokenAccount::unpack(&signer_debt_ta.unwrap().data.borrow())?;
    let balance = signer_token_account.amount;
    if balance == 0 {
        msg!("Unable to initiate DCA with a lack of funds in the signer debt token account");
        return Err(ProgramError::InvalidInstructionData.into());
    }

    let DCADirection::In(base_unit_amount) = active_dca.dca_direction else {
        panic!("Expected DCADirection::In variant");
    };

    if base_unit_amount > balance {
        msg!("Provided greater DCA-in value than exists in the signer debt token account");
        return Err(ProgramError::InvalidInstructionData.into());
    }

    position.debt_ta_balance += base_unit_amount;
    spl_token_transfer(
        token_program,
        signer_debt_ta.unwrap(),
        signer,
        position_debt_ta.unwrap(),
        base_unit_amount,
        None,
    )?;

    Ok(())
}

pub fn is_dca_instruction(
    solauto_position: &SolautoPosition,
    obligation_position: &LendingProtocolObligationPosition,
    current_unix_timestamp: u64,
) -> Result<Option<DCADirection>, ProgramError> {
    if solauto_position.self_managed
        || solauto_position
            .position
            .as_ref()
            .unwrap()
            .protocol_data
            .debt_mint
            .is_none()
    {
        return Ok(None);
    }

    if obligation_position.current_liq_utilization_rate_bps()
        >= solauto_position
            .position
            .as_ref()
            .unwrap()
            .setting_params
            .as_ref()
            .unwrap()
            .repay_from_bps()
    {
        return Ok(None);
    }

    if solauto_position
        .position
        .as_ref()
        .unwrap()
        .active_dca
        .is_none()
    {
        return Ok(None);
    }

    let dca_settings = solauto_position
        .position
        .as_ref()
        .unwrap()
        .active_dca
        .as_ref()
        .unwrap();

    if dca_settings.unix_start_date.add(
        dca_settings
            .unix_dca_interval
            .mul(dca_settings.dca_periods_passed as u64),
    ) < current_unix_timestamp
    {
        return Ok(None);
    }

    Ok(Some(dca_settings.dca_direction))
}

pub fn cancel_active_dca<'a, 'b>(solauto_position: &mut DeserializedAccount<'a, SolautoPosition>) -> ProgramResult {
    let position_data = solauto_position.data.position.as_mut().unwrap();
    let active_dca = position_data.active_dca.as_ref().unwrap();

    if let DCADirection::In(_) = active_dca.dca_direction {
        if position_data.debt_ta_balance > 0 {
            // TODO: Return remaining debt balance
        }
    }
    
    position_data.active_dca = None;

    Ok(())
}

pub struct SolautoFeesBps {
    pub solauto: u16,
    pub referrer: u16,
    pub total: u16,
}
impl SolautoFeesBps {
    pub fn from(has_been_referred: bool) -> Self {
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
