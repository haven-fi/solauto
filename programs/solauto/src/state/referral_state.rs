use borsh::BorshSerialize;
use bytemuck::Pod;
use bytemuck::Zeroable;
use shank::ShankAccount;
use solana_program::pubkey::Pubkey;

#[repr(C, align(8))]
#[derive(ShankAccount, BorshSerialize, Clone, Debug, Copy, Pod, Zeroable)]
pub struct ReferralState {
    bump: [u8; 1],
    _padding1: [u8; 7],
    pub authority: Pubkey,
    pub referred_by_state: Pubkey,
    pub dest_fees_mint: Pubkey,
    pub lookup_table: Pubkey,
    _padding: [u8; 96],
}

impl ReferralState {
    pub const LEN: usize = 232;
    pub fn new(
        authority: Pubkey,
        referred_by_state: Pubkey,
        dest_fees_mint: Pubkey,
        address_lookup_table: Option<Pubkey>,
    ) -> Self {
        let (_, bump) =
            Pubkey::find_program_address(&ReferralState::seeds(&authority).as_slice(), &crate::ID);
        let lookup_table = if address_lookup_table.is_some() {
            address_lookup_table.unwrap()
        } else {
            Pubkey::default()
        };
        Self {
            bump: [bump],
            _padding1: [0; 7],
            authority,
            referred_by_state,
            dest_fees_mint,
            lookup_table,
            _padding: [0; 96],
        }
    }
    pub fn seeds<'a>(authority: &'a Pubkey) -> Vec<&'a [u8]> {
        vec![b"referral_state", authority.as_ref()]
    }
    pub fn seeds_with_bump<'a>(&'a self) -> Vec<&'a [u8]> {
        let mut seeds = ReferralState::seeds(&self.authority);
        seeds.push(&self.bump);
        seeds
    }
    pub fn is_referred(&self) -> bool {
        self.referred_by_state != Pubkey::default()
    }
}

mod tests {
    use super::*;

    #[test]
    fn validate_size() {
        let referral_state = ReferralState::new(
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            None,
        );

        println!(
            "Referral state size: {}",
            std::mem::size_of_val(&referral_state)
        );
        assert!(std::mem::size_of_val(&referral_state) == ReferralState::LEN);
    }
}
