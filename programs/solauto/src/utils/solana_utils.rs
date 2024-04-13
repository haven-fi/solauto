use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    instruction::Instruction,
    msg,
    program::{ invoke, invoke_signed },
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction::create_account,
    sysvar::Sysvar,
};
use spl_associated_token_account::{
    get_associated_token_address,
    instruction::create_associated_token_account,
};
use spl_token::instruction::close_account;

pub fn account_is_rent_exempt(
    rent_sysvar: &AccountInfo,
    account: &AccountInfo
) -> Result<bool, ProgramError> {
    let rent = Rent::from_account_info(rent_sysvar)?;
    Ok(rent.is_exempt(account.lamports(), account.data_len()))
}

pub fn account_has_custom_data(account: &AccountInfo) -> bool {
    !account.data.borrow().is_empty()
}

pub fn init_new_account<'a>(
    system_program: &'a AccountInfo<'a>,
    rent_sysvar: &'a AccountInfo<'a>,
    payer: &'a AccountInfo<'a>,
    account: &'a AccountInfo<'a>,
    new_owner: &Pubkey,
    seed: Vec<&[u8]>,
    space: usize
) -> ProgramResult {
    if account_is_rent_exempt(rent_sysvar, account)? || account_has_custom_data(account) {
        msg!("Account already initialized");
        return Err(ProgramError::AccountAlreadyInitialized.into());
    }

    let rent = Rent::from_account_info(rent_sysvar)?;
    let lamports = rent.minimum_balance(space);

    invoke_signed_with_seed(
        &create_account(payer.key, account.key, lamports, space as u64, new_owner),
        &[payer.clone(), account.clone(), system_program.clone()],
        seed
    )
}

pub fn invoke_signed_with_seed(
    instruction: &Instruction,
    account_infos: &[AccountInfo],
    seed: Vec<&[u8]>
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
    rent_sysvar: &'a AccountInfo<'a>,
    payer: &'a AccountInfo<'a>,
    wallet: &'a AccountInfo<'a>,
    token_account: &'a AccountInfo<'a>,
    token_mint: &'a AccountInfo<'a>
) -> Result<(), ProgramError> {
    if &get_associated_token_address(wallet.key, token_mint.key) != token_account.key {
        msg!("Token account is not correct for the given token mint & wallet");
        return Err(ProgramError::InvalidAccountData.into());
    }

    if account_is_rent_exempt(rent_sysvar, token_account)? {
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

pub fn close_token_account<'a>(
    token_program: &'a AccountInfo<'a>,
    account: &'a AccountInfo<'a>,
    sol_destination: &'a AccountInfo<'a>,
    account_owner: &'a AccountInfo<'a>
) -> ProgramResult {
    invoke(
        &close_account(
            token_program.key,
            account.key,
            sol_destination.key,
            account_owner.key,
            &[]
        )?,
        &[
            account.clone(),
            sol_destination.clone(),
            account_owner.clone(),
            token_program.clone()
        ]
    )
}
