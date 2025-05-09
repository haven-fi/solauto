use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    instruction::Instruction,
    program::{ invoke, invoke_signed },
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};
use spl_associated_token_account::instruction::create_associated_token_account;
use spl_token::instruction as spl_instruction;

use crate::{
    check,
    types::{ errors::SolautoError, shared::SplTokenTransferArgs },
    utils::validation_utils::correct_token_account,
};

pub fn account_has_data(account: &AccountInfo) -> bool {
    !account.data.borrow().is_empty()
}

pub fn invoke_instruction(
    instruction: &Instruction,
    account_infos: &[AccountInfo],
    seeds: Option<&Vec<&[u8]>>
) -> ProgramResult {
    if let Some(seeds) = seeds {
        invoke_signed(instruction, account_infos, &[seeds.as_slice()])
    } else {
        invoke(instruction, account_infos)
    }
}

pub fn init_account<'a>(
    rent_sysvar: &AccountInfo,
    payer: &'a AccountInfo<'a>,
    account: &'a AccountInfo<'a>,
    new_owner: &Pubkey,
    account_seed: Option<Vec<&[u8]>>,
    space: usize
) -> ProgramResult {
    check!(!account_has_data(account), SolautoError::IncorrectAccounts);

    let rent = &Rent::from_account_info(rent_sysvar)?;
    let required_lamports = rent.minimum_balance(space).saturating_sub(account.lamports());
    if required_lamports > 0 {
        system_transfer(payer, account, required_lamports, None)?;
    }

    let accounts = &[account.clone()];

    invoke_instruction(
        &system_instruction::allocate(account.key, space.try_into().unwrap()),
        accounts,
        account_seed.as_ref()
    )?;

    invoke_instruction(
        &system_instruction::assign(account.key, &new_owner),
        accounts,
        account_seed.as_ref()
    )?;

    Ok(())
}

pub fn init_ata_if_needed<'a, 'b>(
    token_program: &'a AccountInfo<'a>,
    system_program: &'a AccountInfo<'a>,
    payer: &'a AccountInfo<'a>,
    wallet: &'a AccountInfo<'a>,
    token_account: &'a AccountInfo<'a>,
    token_mint: &'a AccountInfo<'a>
) -> ProgramResult {
    check!(
        correct_token_account(token_account.key, wallet.key, token_mint.key),
        SolautoError::IncorrectAccounts
    );

    if account_has_data(token_account) {
        return Ok(());
    }

    invoke(
        &create_associated_token_account(payer.key, wallet.key, token_mint.key, token_program.key),
        &[
            payer.clone(),
            token_account.clone(),
            wallet.clone(),
            token_mint.clone(),
            system_program.clone(),
            token_program.clone(),
        ]
    )
}

pub fn system_transfer<'a>(
    source: &'a AccountInfo<'a>,
    destination: &'a AccountInfo<'a>,
    lamports: u64,
    source_seeds: Option<&Vec<&[u8]>>
) -> ProgramResult {
    invoke_instruction(
        &system_instruction::transfer(source.key, destination.key, lamports),
        &[source.clone(), destination.clone()],
        source_seeds
    )
}

pub fn spl_token_transfer<'a, 'b>(
    token_program: &'a AccountInfo<'a>,
    args: SplTokenTransferArgs<'a, 'b>
) -> ProgramResult {
    invoke_instruction(
        &spl_instruction::transfer(
            token_program.key,
            args.source.key,
            args.recipient.key,
            args.authority.key,
            &[],
            args.amount
        )?,
        &[args.source.clone(), args.recipient.clone(), args.authority.clone()],
        args.authority_seeds
    )
}

pub fn close_token_account<'a, 'b>(
    token_program: &'a AccountInfo<'a>,
    account: &'a AccountInfo<'a>,
    sol_destination: &'a AccountInfo<'a>,
    account_owner: &'a AccountInfo<'a>,
    owner_seeds: Option<&Vec<&[u8]>>
) -> ProgramResult {
    invoke_instruction(
        &spl_instruction::close_account(
            token_program.key,
            account.key,
            sol_destination.key,
            account_owner.key,
            &[]
        )?,
        &[account.clone(), sol_destination.clone(), account_owner.clone()],
        owner_seeds
    )
}

pub fn close_pda(pda: &AccountInfo, sol_destination: &AccountInfo) -> ProgramResult {
    let pda_lamports = pda.lamports();
    **sol_destination.try_borrow_mut_lamports()? += pda_lamports;
    **pda.try_borrow_mut_lamports()? -= pda_lamports;
    Ok(())
}
