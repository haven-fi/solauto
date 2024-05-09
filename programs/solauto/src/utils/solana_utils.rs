use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    instruction::Instruction,
    msg,
    program::{invoke, invoke_signed},
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};
use spl_associated_token_account::{
    get_associated_token_address, instruction::create_associated_token_account,
};
use spl_token::instruction as spl_instruction;

use crate::types::shared::SolautoError;

pub fn account_has_data(account: &AccountInfo) -> bool {
    !account.data.borrow().is_empty()
}

pub fn init_account<'a>(
    system_program: &'a AccountInfo<'a>,
    rent_sysvar: &'a AccountInfo<'a>,
    payer: &'a AccountInfo<'a>,
    account: &'a AccountInfo<'a>,
    new_owner: &Pubkey,
    seed: Option<Vec<&[u8]>>,
    space: usize,
) -> ProgramResult {
    if account_has_data(account) {
        return Err(SolautoError::IncorrectAccounts.into());
    }

    let rent = &Rent::from_account_info(rent_sysvar)?;
    let required_lamports = rent
        .minimum_balance(space)
        .saturating_sub(account.lamports());
    if required_lamports > 0 {
        invoke(
            &system_instruction::transfer(payer.key, account.key, required_lamports),
            &[payer.clone(), account.clone(), system_program.clone()],
        )?;
    }

    let accounts = &[account.clone(), system_program.clone()];

    let allocate_ix = &system_instruction::allocate(account.key, space.try_into().unwrap());
    if seed.is_some() {
        invoke_signed_with_seed(allocate_ix, accounts, seed.as_ref().unwrap().clone())?;
    } else {
        invoke(allocate_ix, accounts)?;
    }

    let assign_ix = &system_instruction::assign(account.key, &new_owner);
    if seed.is_some() {
        invoke_signed_with_seed(assign_ix, accounts, seed.unwrap())?;
    } else {
        invoke(assign_ix, accounts)?;
    }

    Ok(())
}

pub fn invoke_signed_with_seed(
    instruction: &Instruction,
    account_infos: &[AccountInfo],
    seed: Vec<&[u8]>,
) -> ProgramResult {
    let (_, bump) = Pubkey::find_program_address(seed.as_slice(), &crate::ID);

    let mut flat_seeds: Vec<&[u8]> = Vec::new();
    for s in seed {
        flat_seeds.extend_from_slice(&[s]);
    }
    let binding = [bump];
    flat_seeds.push(&binding);

    invoke_signed(instruction, account_infos, &[flat_seeds.as_slice()])
}

pub fn init_ata_if_needed<'a>(
    token_program: &'a AccountInfo<'a>,
    system_program: &'a AccountInfo<'a>,
    payer: &'a AccountInfo<'a>,
    wallet: &'a AccountInfo<'a>,
    token_account: &'a AccountInfo<'a>,
    token_mint: &'a AccountInfo<'a>,
) -> ProgramResult {
    if &get_associated_token_address(wallet.key, token_mint.key) != token_account.key {
        msg!(format!(
            "Token account is not correct for the given token mint ({}) & wallet ({})",
            token_mint.key, wallet.key
        )
        .as_str());
        return Err(SolautoError::IncorrectAccounts.into());
    }

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
        ],
    )
}

pub fn close_token_account<'a>(
    token_program: &'a AccountInfo<'a>,
    account: &'a AccountInfo<'a>,
    sol_destination: &'a AccountInfo<'a>,
    account_owner: &'a AccountInfo<'a>,
) -> ProgramResult {
    invoke(
        &spl_instruction::close_account(
            token_program.key,
            account.key,
            sol_destination.key,
            account_owner.key,
            &[],
        )?,
        &[
            account.clone(),
            sol_destination.clone(),
            account_owner.clone(),
            token_program.clone(),
        ],
    )
}

pub fn close_pda<'a, 'b>(
    account: &'a AccountInfo<'a>,
    sol_destination: &'a AccountInfo<'a>,
    pda_seeds: Vec<&'b [u8]>,
) -> ProgramResult {
    invoke_signed_with_seed(
        &system_instruction::transfer(
            account.key,
            sol_destination.key,
            **account.lamports.borrow(),
        ),
        &[account.clone(), sol_destination.clone()],
        pda_seeds,
    )
}

pub fn spl_token_transfer<'a, 'b>(
    token_program: &'a AccountInfo<'a>,
    sender: &'a AccountInfo<'a>,
    authority: &'a AccountInfo<'a>,
    recipient: &'a AccountInfo<'a>,
    amount: u64,
    pda_seeds: Option<Vec<&'b [u8]>>,
) -> ProgramResult {
    let transfer_instruction = spl_instruction::transfer(
        token_program.key,
        sender.key,
        recipient.key,
        &authority.key,
        &[],
        amount,
    )?;

    if pda_seeds.is_some() {
        invoke_signed_with_seed(
            &transfer_instruction,
            &[sender.clone(), recipient.clone(), token_program.clone()],
            pda_seeds.unwrap(),
        )
    } else {
        invoke(
            &transfer_instruction,
            &[
                sender.clone(),
                recipient.clone(),
                authority.clone(),
                token_program.clone(),
            ],
        )
    }
}
