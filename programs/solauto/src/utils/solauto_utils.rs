use solana_program::{
    account_info::AccountInfo,
    clock::Clock,
    entrypoint::ProgramResult,
    instruction::{ get_stack_height, Instruction, TRANSACTION_LEVEL_STACK_HEIGHT },
    msg,
    program_error::ProgramError,
    program_pack::Pack,
    pubkey::Pubkey,
    sysvar::{ instructions::{ load_current_index_checked, load_instruction_at_checked }, Sysvar },
};
use spl_associated_token_account::get_associated_token_address;
use spl_token::state::Account as TokenAccount;
use std::ops::{ Add, Mul };

use super::solana_utils::{
    self,
    account_has_custom_data,
    get_anchor_ix_discriminator,
    init_ata_if_needed,
    init_new_account,
};
use crate::{
    constants::{
        JUP_PROGRAM,
        MARGINFI_PROGRAM,
        REFERRER_FEE_SPLIT,
        SOLAUTO_FEES_WALLET,
        WSOL_MINT,
    },
    types::{
        instruction::{
            RebalanceArgs,
            SolautoStandardAccounts,
            UpdatePositionData,
            SOLAUTO_REBALANCE_IX_DISCRIMINATORS,
        },
        obligation_position::LendingProtocolObligationPosition,
        shared::{
            DCADirection,
            DeserializedAccount,
            LendingPlatform,
            PositionAccount,
            PositionData,
            PositionState,
            ReferralStateAccount,
            SolautoError,
            SolautoRebalanceStep,
            REFERRAL_ACCOUNT_SPACE,
        },
    },
};

pub fn get_owner<'a, 'b>(
    solauto_position: &'b DeserializedAccount<'a, PositionAccount>,
    signer: &'a AccountInfo<'a>
) -> &'a AccountInfo<'a> {
    if solauto_position.data.self_managed { signer } else { solauto_position.account_info }
}

pub fn create_new_solauto_position<'a>(
    signer: &AccountInfo<'a>,
    solauto_position: &'a AccountInfo<'a>,
    update_position_data: UpdatePositionData,
    lending_platform: LendingPlatform
) -> Result<DeserializedAccount<'a, PositionAccount>, ProgramError> {
    let data = if update_position_data.setting_params.is_some() {
        if update_position_data.position_id == 0 {
            msg!("Position ID 0 is reserved for self managed positions");
            return Err(ProgramError::InvalidInstructionData.into());
        }

        PositionAccount {
            position_id: update_position_data.position_id,
            authority: *signer.key,
            self_managed: false,
            position: Some(PositionData {
                setting_params: update_position_data.setting_params.unwrap().clone(),
                state: PositionState::default(),
                lending_platform,
                protocol_data: update_position_data.protocol_data.unwrap().clone(),
                active_dca: update_position_data.active_dca.clone(),
                supply_balance: 0,
                debt_balance: 0,
            }),
        }
    } else {
        PositionAccount {
            position_id: update_position_data.position_id,
            authority: *signer.key,
            self_managed: true,
            position: None,
        }
    };

    Ok(DeserializedAccount::<PositionAccount> {
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
    referred_by_state: Option<&'a AccountInfo<'a>>
) -> Result<DeserializedAccount<'a, ReferralStateAccount>, ProgramError> {
    let referral_state_seeds = get_referral_account_seeds(authority.key);
    let (referral_state_pda, _bump) = Pubkey::find_program_address(
        referral_state_seeds.as_slice(),
        &crate::ID
    );
    if &referral_state_pda != referral_state.key {
        msg!("Invalid referral position account given for the provided authority");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    if account_has_custom_data(referral_state) {
        let mut referral_state_account = DeserializedAccount::<ReferralStateAccount>
            ::deserialize(Some(referral_state))?
            .unwrap();

        if referral_state_account.data.referred_by_state.is_none() && referred_by_state.is_some() {
            referral_state_account.data.referred_by_state = Some(
                referred_by_state.unwrap().key.clone()
            );
        }

        if
            referral_fees_dest_mint.is_some() &&
            referral_fees_dest_mint.as_ref().unwrap() != &referral_state_account.data.dest_fees_mint
        {
            referral_state_account.data.dest_fees_mint = referral_fees_dest_mint.unwrap().clone();
        }

        Ok(referral_state_account)
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
    supply_mint: &'a AccountInfo<'a>
) -> ProgramResult {
    if solauto_fees_wallet.key != &SOLAUTO_FEES_WALLET {
        return Err(SolautoError::IncorrectFeesReceiverAccount.into());
    }
    init_ata_if_needed(
        token_program,
        system_program,
        signer,
        solauto_fees_wallet,
        solauto_fees_supply_ta,
        supply_mint
    )
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
    if
        args.target_liq_utilization_rate_bps.is_some() &&
        std_accounts.signer.key != &std_accounts.solauto_position.data.authority
    {
        msg!(
            "Cannot provide a target liquidation utilization rate if the instruction is not signed by the position authority"
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
        Err(SolautoError::IncorrectInstructions.into())
    }
}

pub fn get_relative_instruction(
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

pub struct InstructionChecker {
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

pub fn initiate_dca_in_if_necessary<'a, 'b>(
    token_program: &'a AccountInfo<'a>,
    solauto_position: &'b mut DeserializedAccount<'a, PositionAccount>,
    position_debt_ta: Option<&'a AccountInfo<'a>>,
    signer: &'a AccountInfo<'a>,
    signer_debt_ta: Option<&'a AccountInfo<'a>>
) -> ProgramResult {
    if !solauto_position.data.self_managed {
        return Ok(());
    }

    let position = solauto_position.data.position.as_ref().unwrap();
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

    if
        position_debt_ta.unwrap().key !=
        &get_associated_token_address(
            solauto_position.account_info.key,
            solauto_position.data.position
                .as_ref()
                .unwrap()
                .protocol_data.debt_mint.as_ref()
                .unwrap()
        )
    {
        msg!("Incorrect position token account provided");
        return Err(SolautoError::IncorrectAccounts.into());
    }

    let balance = TokenAccount::unpack(&signer_debt_ta.unwrap().data.borrow())?.amount;
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

    solauto_position.data.position.as_mut().unwrap().debt_balance += base_unit_amount;
    solana_utils::spl_token_transfer(
        token_program,
        signer_debt_ta.unwrap(),
        signer,
        position_debt_ta.unwrap(),
        base_unit_amount,
        None
    )
}

pub fn is_dca_instruction(
    solauto_position: &DeserializedAccount<PositionAccount>,
    obligation_position: &LendingProtocolObligationPosition
) -> Result<Option<DCADirection>, ProgramError> {
    if solauto_position.data.self_managed {
        return Ok(None);
    }

    if
        obligation_position.current_liq_utilization_rate_bps() >=
        solauto_position.data.position.as_ref().unwrap().setting_params.repay_from_bps
    {
        return Ok(None);
    }

    if solauto_position.data.position.as_ref().unwrap().active_dca.is_none() {
        return Ok(None);
    }

    let dca_settings = solauto_position.data.position
        .as_ref()
        .unwrap()
        .active_dca.as_ref()
        .unwrap();
    let clock = Clock::get()?;

    if
        dca_settings.unix_start_date.add(
            dca_settings.unix_dca_interval.mul(dca_settings.dca_periods_passed as u64)
        ) < (clock.unix_timestamp as u64)
    {
        return Ok(None);
    }

    Ok(Some(dca_settings.dca_direction))
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
