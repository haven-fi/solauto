use borsh::{BorshDeserialize, BorshSerialize};
use jupiter_sdk::generated::instructions::{
    ExactOutRouteInstructionArgs, RouteWithTokenLedgerInstructionArgs,
    SharedAccountsExactOutRouteInstructionArgs, SharedAccountsRouteWithTokenLedgerInstructionArgs,
};
use marginfi_sdk::generated::instructions::LendingAccountBorrowInstructionArgs;
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    hash::hash,
    instruction::Instruction,
    msg,
    program::invoke,
    program_error::ProgramError,
    pubkey::Pubkey,
    sanitize::SanitizeError,
    serialize_utils::{read_pubkey, read_slice, read_u16},
};

use super::solana_utils::invoke_instruction;
use crate::{
    state::solauto_position::SolautoPosition,
    types::shared::{DeserializedAccount, SolautoError},
};

pub fn update_data<T: BorshSerialize>(account: &mut DeserializedAccount<T>) -> ProgramResult {
    account
        .data
        .serialize(&mut &mut account.account_info.data.borrow_mut()[..])
        .map_err(|err| {
            msg!("{}", err);
            err
        })?;
    Ok(())
}

pub fn solauto_invoke_instruction(
    instruction: Instruction,
    account_infos: &[AccountInfo],
    solauto_position: &DeserializedAccount<SolautoPosition>,
) -> ProgramResult {
    if solauto_position.data.self_managed.val {
        invoke(&instruction, account_infos)
    } else {
        invoke_instruction(
            &instruction,
            account_infos,
            Some(&solauto_position.data.seeds_with_bump()),
        )
    }
}

pub struct PickIxDataReq<'a> {
    pub ixs_sysvar: &'a AccountInfo<'a>,
    pub ix_idx: usize,
    pub data_start_idx: Option<u64>,
    pub data_len: Option<u64>,
    pub account_indices: Option<Vec<u16>>,
}

pub struct PickIxDataResp {
    pub program_id: Pubkey,
    pub data: Vec<u8>,
    pub accounts: Vec<Pubkey>,
}

fn pick_ix_data(req: PickIxDataReq) -> Result<PickIxDataResp, SanitizeError> {
    let PickIxDataReq {
        ixs_sysvar,
        ix_idx,
        data_start_idx,
        data_len,
        account_indices,
    } = req;

    let data = Box::new(
        ixs_sysvar
            .try_borrow_data()
            .expect("Should retrieve IXS sysvar data"),
    );

    // First byte indicates the number of instructions
    let mut current = 2 + ix_idx * 2;
    let ix_start = read_u16(&mut current, &data)?;

    current = ix_start as usize;
    let num_accounts = read_u16(&mut current, &data)?;

    let indices = account_indices.unwrap_or(vec![]);
    let mut accounts = Vec::with_capacity(indices.len());
    for idx in 0..num_accounts {
        if indices.contains(&idx) {
            current += 1;
            accounts.push(read_pubkey(&mut current, &data)?);
        } else {
            // Skip byte that indicates if account is signer / writable
            current += 1 + std::mem::size_of::<Pubkey>();
        }
    }

    let program_id = read_pubkey(&mut current, &data)?;
    let instruction_data_len = read_u16(&mut current, &data)? as usize;

    let data_start = data_start_idx.unwrap_or(0) as usize;
    let data_end =
        data_start + (data_len.unwrap_or((instruction_data_len - data_start) as u64) as usize);

    current += data_start;
    let picked_data = read_slice(&mut current, &data, data_end)?;

    drop(data);
    Ok(PickIxDataResp {
        program_id,
        data: picked_data,
        accounts,
    })
}

/// Validates the jup swap:
/// - The swap does NOT have a platform fee
/// - The destination token account is one of the expected destination token accounts
///
/// Returns the slippage_fee_bps
pub fn validate_jup_instruction<'a>(
    ixs_sysvar: &'a AccountInfo<'a>,
    ix_idx: usize,
    expected_destination_tas: &[&Pubkey],
) -> Result<(Pubkey, u16), ProgramError> {
    let resp = pick_ix_data(PickIxDataReq {
        ixs_sysvar,
        ix_idx,
        data_start_idx: Some(0),
        data_len: Some(8), // Only pick the data discriminator
        account_indices: None,
    })
    .expect("Should pick data");

    let discriminator =
        u64::from_le_bytes(resp.data.try_into().expect("Slice with incorrect length"));

    let route_with_token_ledger = get_anchor_ix_discriminator("route_with_token_ledger");
    let shared_accounts_route_with_token_ledger =
        get_anchor_ix_discriminator("shared_accounts_route_with_token_ledger");
    let exact_out_route = get_anchor_ix_discriminator("exact_out_route");
    let shared_accounts_exact_out_route =
        get_anchor_ix_discriminator("shared_accounts_exact_out_route");

    let result: Result<(u16, u8, Pubkey, Pubkey), ProgramError> =
        if discriminator == route_with_token_ledger {
            let resp = pick_ix_data(PickIxDataReq {
                ixs_sysvar,
                ix_idx,
                data_start_idx: Some(8), // Skip data discriminator
                data_len: None,
                account_indices: Some(vec![2, 4]),
            })
            .expect("Should pick data");

            let args = Box::new(RouteWithTokenLedgerInstructionArgs::deserialize(
                &mut resp.data.as_slice(),
            )?);

            let return_data = (
                args.slippage_bps,
                args.platform_fee_bps,
                resp.accounts[0],
                resp.accounts[1],
            );
            drop(args);
            Ok(return_data)
        } else if discriminator == shared_accounts_route_with_token_ledger {
            let resp = pick_ix_data(PickIxDataReq {
                ixs_sysvar,
                ix_idx,
                data_start_idx: Some(8), // Skip data discriminator
                data_len: None,
                account_indices: Some(vec![3, 6]),
            })
            .expect("Should pick data");

            let args = Box::new(
                SharedAccountsRouteWithTokenLedgerInstructionArgs::deserialize(
                    &mut resp.data.as_slice(),
                )?,
            );

            let return_data = (
                args.slippage_bps,
                args.platform_fee_bps,
                resp.accounts[0],
                resp.accounts[1],
            );
            drop(args);
            Ok(return_data)
        } else if discriminator == exact_out_route {
            let resp = pick_ix_data(PickIxDataReq {
                ixs_sysvar,
                ix_idx,
                data_start_idx: Some(8), // Skip data discriminator
                data_len: None,
                account_indices: Some(vec![2, 4]),
            })
            .expect("Should pick data");

            let args = Box::new(ExactOutRouteInstructionArgs::deserialize(
                &mut resp.data.as_slice(),
            )?);

            let return_data = (
                args.slippage_bps,
                args.platform_fee_bps,
                resp.accounts[0],
                resp.accounts[1],
            );
            drop(args);
            Ok(return_data)
        } else if discriminator == shared_accounts_exact_out_route {
            let resp = pick_ix_data(PickIxDataReq {
                ixs_sysvar,
                ix_idx,
                data_start_idx: Some(8), // Skip data discriminator
                data_len: None,
                account_indices: Some(vec![3, 6]),
            })
            .expect("Should pick data");

            let args = Box::new(SharedAccountsExactOutRouteInstructionArgs::deserialize(
                &mut resp.data.as_slice(),
            )?);

            let return_data = (
                args.slippage_bps,
                args.platform_fee_bps,
                resp.accounts[0],
                resp.accounts[1],
            );
            drop(args);
            Ok(return_data)
        } else {
            Err(SolautoError::IncorrectInstructions.into())
        };

    let (slippage_fee_bps, platform_fee, source_ta, destination_ta) = result.unwrap();

    if platform_fee > 0 {
        msg!("Cannot include a platform fee in a token swap");
        return Err(SolautoError::IncorrectInstructions.into());
    }

    if !expected_destination_tas
        .iter()
        .any(|x| x == &&destination_ta)
    {
        msg!("Moving funds into an incorrect token account");
        return Err(SolautoError::IncorrectInstructions.into());
    }

    Ok((source_ta, slippage_fee_bps))
}

pub fn get_marginfi_flash_loan_amount<'a>(
    ixs_sysvar: &'a AccountInfo<'a>,
    ix_idx: usize,
    expected_destination_tas: Option<&[&Pubkey]>,
) -> Result<u64, ProgramError> {
    let res = pick_ix_data(PickIxDataReq {
        ixs_sysvar,
        ix_idx,
        data_start_idx: Some(8),
        data_len: Some(8),
        account_indices: Some(vec![4]),
    })
    .expect("Should pick data");
    let args = LendingAccountBorrowInstructionArgs::deserialize(&mut res.data.as_slice())?;

    if expected_destination_tas.is_some()
        && !expected_destination_tas
            .unwrap()
            .iter()
            .any(|x| x == &&res.accounts[0])
    {
        msg!("Moving funds into an incorrect token account");
        return Err(SolautoError::IncorrectInstructions.into());
    }

    return Ok(args.amount);
}

pub fn get_anchor_ix_discriminator(instruction_name: &str) -> u64 {
    let concatenated = format!("global:{}", instruction_name.to_lowercase());
    let mut sighash = [0u8; 8];
    sighash.copy_from_slice(&hash(concatenated.as_bytes()).to_bytes()[..8]);
    u64::from_le_bytes(sighash)
}

pub struct InstructionChecker<'a> {
    anchor_program: bool,
    ixs_sysvar: &'a AccountInfo<'a>,
    program_id: Pubkey,
    ix_discriminators: Option<Vec<u8>>,
    anchor_ix_discriminators: Option<Vec<u64>>,
    curr_ix_idx: u16,
}
impl<'a> InstructionChecker<'a> {
    pub fn from(
        ixs_sysvar: &'a AccountInfo<'a>,
        program_id: Pubkey,
        ix_discriminators: Option<Vec<u8>>,
        curr_ix_idx: u16,
    ) -> Self {
        Self {
            anchor_program: false,
            ixs_sysvar,
            program_id,
            ix_discriminators,
            anchor_ix_discriminators: None,
            curr_ix_idx,
        }
    }
    pub fn from_anchor(
        ixs_sysvar: &'a AccountInfo<'a>,
        program_id: Pubkey,
        ix_names: Vec<&str>,
        curr_ix_idx: u16,
    ) -> Self {
        let mut ix_discriminators: Vec<u64> = Vec::with_capacity(ix_names.len());
        for name in ix_names.iter() {
            ix_discriminators.push(get_anchor_ix_discriminator(name));
        }
        Self {
            anchor_program: true,
            ixs_sysvar,
            program_id,
            ix_discriminators: None,
            anchor_ix_discriminators: Some(ix_discriminators),
            curr_ix_idx,
        }
    }
    fn ix_matches(&self, program_id: Pubkey, discriminator_data: &[u8]) -> bool {
        if program_id == self.program_id {
            if self.anchor_program {
                let discriminator = u64::from_le_bytes(
                    discriminator_data[0..8]
                        .try_into()
                        .expect("Should be 8 bytes"),
                );

                if self.anchor_ix_discriminators.is_none()
                    || self
                        .anchor_ix_discriminators
                        .as_ref()
                        .unwrap()
                        .iter()
                        .any(|&x| x == discriminator)
                {
                    return true;
                }
            }

            if !self.anchor_program
                && (self.ix_discriminators.is_none()
                    || self
                        .ix_discriminators
                        .as_ref()
                        .unwrap()
                        .iter()
                        .any(|&x| x == discriminator_data[0]))
            {
                return true;
            }
        }
        false
    }
    pub fn matches(&self, relative_ix_idx: i16) -> bool {
        let discriminator_len = if self.anchor_program { 8 } else { 1 };

        let data = pick_ix_data(PickIxDataReq {
            ixs_sysvar: self.ixs_sysvar,
            ix_idx: ((self.curr_ix_idx as i16) + relative_ix_idx) as usize,
            data_start_idx: Some(0),
            data_len: Some(discriminator_len),
            account_indices: None,
        })
        .expect("Should work");

        return self.ix_matches(data.program_id, &data.data);
    }
}
