use std::{ cmp::min, collections::HashMap };
use solana_program::{
    instruction::{ get_stack_height, Instruction, TRANSACTION_LEVEL_STACK_HEIGHT },
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::instructions::{ load_current_index_checked, load_instruction_at_checked },
    account_info::AccountInfo,
};
use spl_associated_token_account::get_associated_token_address;

use super::{
    ix_utils,
    math_utils::get_maximum_repay_to_bps_param,
    solana_utils::{
        account_is_rent_exempt,
        get_anchor_ix_discriminator,
        init_ata_if_needed,
        init_new_account,
    },
};
use crate::{
    constants::{ JUP_PROGRAM, MARGINFI_PROGRAM, REFERRER_FEE_SPLIT, SOLAUTO_REBALANCER, WSOL_MINT },
    types::{
        instruction::{
            PositionData,
            RebalanceArgs,
            SolautoStandardAccounts,
            SOLAUTO_REBALANCE_IX_DISCRIMINATORS,
        },
        obligation_position::LendingProtocolObligationPosition,
        shared::{
            DeserializedAccount,
            GeneralPositionData,
            LendingPlatform,
            Position,
            RefferalState,
            SolautoError,
            SolautoRebalanceStep,
            REFERRAL_ACCOUNT_SPACE,
        },
    },
};

pub fn get_owner<'a, 'b>(
    solauto_position: &'b Option<DeserializedAccount<'a, Position>>,
    signer: &'a AccountInfo<'a>
) -> &'a AccountInfo<'a> {
    if !solauto_position.is_none() {
        solauto_position.as_ref().unwrap().account_info
    } else {
        signer
    }
}

pub fn create_new_solauto_position<'a>(
    signer: &AccountInfo<'a>,
    solauto_position: Option<&'a AccountInfo<'a>>,
    new_position_data: Option<PositionData>,
    lending_platform: LendingPlatform
) -> Result<Option<DeserializedAccount<'a, Position>>, ProgramError> {
    let data = if !new_position_data.is_none() {
        let data = new_position_data.as_ref().unwrap();
        Some(Position {
            position_id: data.position_id,
            authority: *signer.key,
            setting_params: data.setting_params.clone(),
            general_data: GeneralPositionData::default(),
            lending_platform,
            marginfi_data: data.marginfi_data.clone(),
            solend_data: data.solend_data.clone(),
            kamino_data: data.kamino_data.clone(),
        })
    } else {
        None
    };

    if !data.is_none() {
        Ok(
            Some(DeserializedAccount::<Position> {
                account_info: solauto_position.unwrap(),
                data: Box::new(data.unwrap()),
            })
        )
    } else {
        Ok(None)
    }
}

pub fn get_or_create_referral_state<'a>(
    system_program: &'a AccountInfo<'a>,
    token_program: &'a AccountInfo<'a>,
    rent: &'a AccountInfo<'a>,
    signer: &'a AccountInfo<'a>,
    authority: &'a AccountInfo<'a>,
    referral_state: &'a AccountInfo<'a>,
    referral_fees_mint: &'a AccountInfo<'a>,
    referral_dest_ta: &'a AccountInfo<'a>,
    referred_by_state: Option<&'a AccountInfo<'a>>,
    referred_by_dest_ta: Option<&'a AccountInfo<'a>>
) -> Result<DeserializedAccount<'a, RefferalState>, ProgramError> {
    let validate_correct_token_account = |wallet: &AccountInfo, token_account: &AccountInfo| {
        let token_account_pubkey = get_associated_token_address(wallet.key, &WSOL_MINT);
        if &token_account_pubkey != token_account.key {
            msg!("Token account is not correct for the given token mint & wallet");
            return Err(ProgramError::InvalidAccountData);
        }
        Ok(())
    };

    let referral_state_seeds = get_referral_account_seeds(authority);
    let (referral_state_pda, _bump) = Pubkey::find_program_address(
        referral_state_seeds.as_slice(),
        &crate::ID
    );
    if &referral_state_pda != referral_state.key {
        msg!("Invalid referral position account given for the provided authority");
        return Err(ProgramError::InvalidAccountData.into());
    }

    validate_correct_token_account(referral_state, referral_dest_ta)?;
    if !referred_by_state.is_none() && !referred_by_dest_ta.is_none() {
        validate_correct_token_account(referral_state, referral_dest_ta)?;
        if referred_by_state.unwrap().owner != &crate::ID {
            msg!("Referred by position account is not owned by Solauto");
            return Err(ProgramError::InvalidAccountData.into());
        }
    }

    if account_is_rent_exempt(rent, referral_state)? {
        let mut referral_state_account = Some(
            DeserializedAccount::<RefferalState>::deserialize(Some(referral_state))?.unwrap()
        );

        if referral_state_account.as_ref().unwrap().data.referred_by_state.is_none() {
            referral_state_account.as_mut().unwrap().data.referred_by_state = Some(
                referred_by_dest_ta.unwrap().key.clone()
            );
        }

        ix_utils::update_data(&mut referral_state_account)?;
        Ok(referral_state_account.unwrap())
    } else {
        init_new_account(
            system_program,
            rent,
            signer,
            referral_state,
            &crate::ID,
            referral_state_seeds[..].to_vec(),
            REFERRAL_ACCOUNT_SPACE
        )?;

        let fees_mint = referral_fees_mint.key;
        if fees_mint != &WSOL_MINT {
            msg!(format!("Referral fees mint must be wSOL {}", WSOL_MINT).as_str());
            return Err(ProgramError::InvalidAccountData.into());
        }

        init_ata_if_needed(
            token_program,
            system_program,
            rent,
            signer,
            referral_state,
            referral_dest_ta,
            referral_fees_mint
        )?;

        if !referred_by_state.is_none() && !referred_by_dest_ta.is_none() {
            init_ata_if_needed(
                token_program,
                system_program,
                rent,
                signer,
                referred_by_state.unwrap(),
                referred_by_dest_ta.unwrap(),
                referral_fees_mint
            )?;
        }

        let data = Box::new(RefferalState {
            authority: authority.key.clone(),
            referred_by_state: referred_by_state.map_or(None, |r| Some(r.key.clone())),
            dest_fees_ta: referral_dest_ta.key.clone(),
            fees_mint: WSOL_MINT.clone(),
        });

        let deserialized_account = DeserializedAccount {
            account_info: referral_state,
            data,
        };

        Ok(deserialized_account)
    }
}

pub fn get_referral_account_seeds<'a>(authority: &'a AccountInfo<'a>) -> Vec<&[u8]> {
    vec![authority.key.as_ref(), b"referrals"]
}

pub fn should_proceed_with_rebalance(
    std_accounts: &SolautoStandardAccounts,
    obligation_position: &LendingProtocolObligationPosition,
    rebalance_args: &RebalanceArgs,
    rebalance_step: &SolautoRebalanceStep
) -> Result<u16, ProgramError> {
    let first_or_only_rebalance_ix =
        rebalance_step == &SolautoRebalanceStep::StartSolautoRebalanceSandwich ||
        rebalance_step == &SolautoRebalanceStep::StartMarginfiFlashLoanSandwich ||
        rebalance_step == &SolautoRebalanceStep::FinishStandardFlashLoanSandwich;

    let current_liq_utilization_rate_bps = if first_or_only_rebalance_ix {
        obligation_position.current_utilization_rate_bps()
    } else {
        // TODO pretend modify supply or debt (based on the source_[supply|debt]_token_account) and calculate new utilization rate using that
        0
    };

    let target_rate_bps = get_target_liq_utilization_rate(
        &std_accounts,
        &obligation_position,
        rebalance_args
    )?;

    if
        first_or_only_rebalance_ix &&
        current_liq_utilization_rate_bps < target_rate_bps &&
        (std_accounts.authority_referral_state.is_none() || std_accounts.referred_by_ta.is_none())
    {
        msg!(
            "Missing referral account(s) when we are boosting leverage. Referral accounts required."
        );
        return Err(ProgramError::InvalidAccountData.into());
    }

    Ok(target_rate_bps)
}

pub fn get_target_liq_utilization_rate(
    std_accounts: &SolautoStandardAccounts,
    obligation_position: &LendingProtocolObligationPosition,
    rebalance_args: &RebalanceArgs
) -> Result<u16, SolautoError> {
    let current_liq_utilization_rate_bps = obligation_position.current_utilization_rate_bps();
    let result: Result<u16, SolautoError> = if
        rebalance_args.target_liq_utilization_rate_bps.is_none()
    {
        let setting_params = &std_accounts.solauto_position.as_ref().unwrap().data.setting_params;
        if current_liq_utilization_rate_bps > setting_params.repay_from_bps {
            let maximum_repay_to_bps = get_maximum_repay_to_bps_param(
                obligation_position.max_ltv,
                obligation_position.liq_threshold
            );
            Ok(min(setting_params.repay_to_bps, maximum_repay_to_bps))
        } else if current_liq_utilization_rate_bps < setting_params.boost_from_bps {
            Ok(setting_params.boost_from_bps)
        } else {
            return Err(SolautoError::InvalidRebalanceCondition.into());
        }
    } else {
        Ok(rebalance_args.target_liq_utilization_rate_bps.unwrap())
    };

    let target_rate_bps = result.unwrap();
    Ok(target_rate_bps)
}

pub fn get_rebalance_step(
    std_accounts: &SolautoStandardAccounts,
    args: &RebalanceArgs
) -> Result<SolautoRebalanceStep, ProgramError> {
    // TODO notes for typescript client
    // max_price_slippage = 0.05 (500bps) (5%)
    // random_price_volatility = 0.03 (300bps) (3%)
    // 1 - max_price_slippage - random_price_volatility = buffer_room = 92%
    // if transaction fails default to flash loan instruction route and increase max slippage if needed

    // increasing leverage:
    // -
    // if debt + debt adjustment keeps utilization rate under buffer_room, instructions are:
    // solauto rebalance - borrows more debt worth debt_adjustment_usd
    // jup swap - swap debt token to supply token
    // solauto rebalance - payout solauto fees & deposit supply token
    // -
    // if debt + debt adjustment brings utilization rate above buffer_room, instructions are:
    // take out flash loan in debt token (+ solauto fees)
    // jup swap - swap debt token to supply token
    // solauto rebalance - payout solauto fees & deposit supply token, borrow equivalent debt token amount from flash borrow ix + flash loan fee
    // repay flash loan in debt token
    // -
    // IF MARGINFI:
    // start flash loan
    // solauto rebalance - borrow debt token worth debt_adjustment_usd
    // jup swap - swap debt token to supply token
    // solauto rebalance - payout solauto fees & deposit supply token
    // end flash loan

    // deleveraging:
    // -
    // if supply - debt adjustment keeps utilization rate under buffer_room, instructions are:
    // solauto rebalance - withdraw supply worth debt_adjustment_usd
    // jup swap - swap supply token to debt token
    // solauto rebalance - repay debt with debt token
    // -
    // if supply - debt adjustment brings utilization rate over buffer_room, instructions are:
    // take out flash loan in supply token
    // jup swap - swap supply token to debt token
    // solauto rebalance - repay debt token, & withdraw equivalent supply token amount from flash borrow ix + flash loan fee
    // repay flash loan in supply token
    // -
    // IF MARGINFI:
    // start flash loan
    // solauto rebalance - withdraw supply token worth debt_adjustment_usd
    // jup swap - swap supply token to debt token
    // solauto rebalance - repay debt token
    // end flash loan

    let ixs_sysvar = std_accounts.ixs_sysvar.unwrap();
    if !args.target_liq_utilization_rate_bps.is_none() && !std_accounts.solauto_position.is_none() {
        msg!(
            "Cannot provide a target liquidation utilization rate if the position is solauto-managed"
        );
        return Err(ProgramError::InvalidInstructionData.into());
    }

    if
        !args.max_price_slippage_bps.is_none() &&
        std_accounts.signer.key != &SOLAUTO_REBALANCER &&
        std_accounts.signer.key != &std_accounts.solauto_position.as_ref().unwrap().data.authority
    {
        msg!(
            "If the signer is not the position authority or Solauto rebalancer accouunts, max_price_slippage_bps cannot be provided"
        );
        return Err(ProgramError::InvalidInstructionData.into());
    }

    let current_ix_idx = load_current_index_checked(ixs_sysvar)?;
    let current_ix = load_instruction_at_checked(current_ix_idx as usize, ixs_sysvar)?;
    if current_ix.program_id != crate::ID || get_stack_height() > TRANSACTION_LEVEL_STACK_HEIGHT {
        return Err(SolautoError::InstructionIsCPI.into());
    }

    let solauto_rebalance = InstructionChecker::from(
        crate::ID,
        Some(SOLAUTO_REBALANCE_IX_DISCRIMINATORS.to_vec())
    );
    let jup_swap = InstructionChecker::from_anchor(
        JUP_PROGRAM,
        "jupiter",
        vec!["route_with_token_ledger", "shared_accounts_route_with_token_ledger"]
    );
    let marginfi_start_fl = InstructionChecker::from_anchor(
        MARGINFI_PROGRAM,
        "marginfi",
        vec!["lending_account_start_flashloan"]
    );
    let marginfi_end_fl = InstructionChecker::from_anchor(
        MARGINFI_PROGRAM,
        "marginfi",
        vec!["lending_account_end_flashloan"]
    );

    let mut rebalance_instructions = 0;
    let mut index = current_ix_idx;
    loop {
        if let Ok(ix) = load_instruction_at_checked(index as usize, ixs_sysvar) {
            if index != current_ix_idx && solauto_rebalance.matches(&Some(ix)) {
                rebalance_instructions += 1;
            }
        } else {
            break;
        }

        index += 1;
    }

    if rebalance_instructions > 2 {
        return Err(SolautoError::RebalanceAbuse.into());
    }

    let next_ix = get_relative_instruction(ixs_sysvar, current_ix_idx, 1, index)?;
    let ix_2_after = get_relative_instruction(ixs_sysvar, current_ix_idx, 2, index)?;
    let ix_3_after = get_relative_instruction(ixs_sysvar, current_ix_idx, 3, index)?;
    let prev_ix = get_relative_instruction(ixs_sysvar, current_ix_idx, -1, index)?;
    let ix_2_before = get_relative_instruction(ixs_sysvar, current_ix_idx, -2, index)?;
    let ix_3_before = get_relative_instruction(ixs_sysvar, current_ix_idx, -3, index)?;

    if
        marginfi_start_fl.matches(&prev_ix) &&
        jup_swap.matches(&next_ix) &&
        solauto_rebalance.matches(&ix_2_after) &&
        marginfi_end_fl.matches(&ix_3_after) &&
        rebalance_instructions == 2
    {
        Ok(SolautoRebalanceStep::StartMarginfiFlashLoanSandwich)
    } else if
        marginfi_start_fl.matches(&ix_3_before) &&
        solauto_rebalance.matches(&ix_2_before) &&
        jup_swap.matches(&prev_ix) &&
        marginfi_end_fl.matches(&next_ix) &&
        rebalance_instructions == 2
    {
        Ok(SolautoRebalanceStep::FinishMarginfiFlashLoanSandwich)
    } else if
        jup_swap.matches(&next_ix) &&
        solauto_rebalance.matches(&ix_2_after) &&
        rebalance_instructions == 2
    {
        Ok(SolautoRebalanceStep::StartSolautoRebalanceSandwich)
    } else if
        jup_swap.matches(&prev_ix) &&
        solauto_rebalance.matches(&ix_2_before) &&
        rebalance_instructions == 2
    {
        Ok(SolautoRebalanceStep::FinishSolautoRebalanceSandwich)
    } else {
        Err(SolautoError::IncorrectRebalanceInstructions.into())
    }
}

fn get_relative_instruction(
    ixs_sysvar: &AccountInfo,
    current_ix_idx: u16,
    relative_idx: i16,
    total_ix_in_tx: u16
) -> Result<Option<Instruction>, ProgramError> {
    if
        (current_ix_idx as i16) + relative_idx > 0 &&
        (current_ix_idx as i16) + relative_idx < (total_ix_in_tx as i16)
    {
        Ok(
            Some(
                load_instruction_at_checked(
                    ((current_ix_idx as i16) + relative_idx) as usize,
                    ixs_sysvar
                )?
            )
        )
    } else {
        Ok(None)
    }
}

struct InstructionChecker {
    program_id: Pubkey,
    ix_discriminators: Option<Vec<u64>>,
}
impl InstructionChecker {
    pub fn from(program_id: Pubkey, ix_discriminators: Option<Vec<u64>>) -> Self {
        Self {
            program_id,
            ix_discriminators,
        }
    }
    pub fn from_anchor(program_id: Pubkey, namespace: &str, ix_names: Vec<&str>) -> Self {
        let mut ix_discriminators: Vec<u64> = Vec::new();
        for name in ix_names.iter() {
            ix_discriminators.push(get_anchor_ix_discriminator(namespace, name));
        }
        Self {
            program_id,
            ix_discriminators: Some(ix_discriminators),
        }
    }
    pub fn matches(&self, ix: &Option<Instruction>) -> bool {
        if ix.is_none() {
            return false;
        }

        let instruction = ix.as_ref().unwrap();
        if instruction.program_id == self.program_id {
            if instruction.data.len() >= 8 {
                let discriminator: [u8; 8] = instruction.data[0..8]
                    .try_into()
                    .expect("Slice with incorrect length");

                if
                    self.ix_discriminators.is_none() ||
                    self.ix_discriminators
                        .as_ref()
                        .unwrap()
                        .iter()
                        .any(|&x| x == u64::from_le_bytes(discriminator))
                {
                    return true;
                }
            }
        }

        false
    }
}

pub struct SolautoFeesBps {
    pub solauto: u16,
    pub referrer: u16,
    pub total: u16,
}
impl SolautoFeesBps {
    pub fn from(has_been_referred: bool) -> Self {
        let solauto = 80;
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
