# Overview

Solauto is a program on the Solana blockchain that lets you manage leveraged longs & shorts on auto-pilot to maximize your gains and eliminate the risk of liquidation.

Solauto is (currently only) built on-top of mrgnlend (Marginfi) - a lending and borrowing platform that allows for a wallet to hold & maintain a leverage position through various instructions (lend, borrow, withdraw, repay).


## Definitions

#### Marginfi Account (account state)

A Marginfi account is the Solana state data that keeps track of a wallet's supply & debt states, i.e. how much SOL has been lent, how much USDC has been borrowed, etc.

#### Solauto referral state (account state)

A Solauto referral state should be 1:1 for each user that interacts with Solauto. Solauto cannot be used for a if a referral state has not been created for the address that is signing, with the exception of the "Solauto Manager". This referral state data will keep track of which address has referred who. The referral state also defines an address lookup table to use for all positions the address uses. This referral state is a PDA, with the seeds of ["referral_state", pubkey]. Any wallet can create a referral state, but only the pubkey used in the seeds of the PDA can update that referral state.

A referral state also exists to collect referral fees (in token accounts tied to the referral state). Only the pubkey of the referral statecan claim the referral fees collected in that referral state.


#### Solauto position (account state)

A Solauto position is state data that keeps track of various pubkeys, setting parameters, and balances. A Solauto position is a PDA, defined by the seeds [position_id (u8), authority (pubkey)]. A Solauto position can be self-managed or not. Any position_id set as 0 is self-managed. Any position_id > 0 is NOT self-managed.

A self-managed position essentially means it does not take ownership (authority) for the Marginfi account being used in the desired transaction. Any NON self-managed position will sign CPI calls through the Solauto position PDA, as the Solauto position WILL be the authority over the Marginfi account.


#### Solauto manager (wallet)

A special wallet that can sign specific transactions (such as rebalancing), for any NON self-managed Solauto position, with restrictions on the permissions of what it can do. This wallet handles rebalancing Solauto positions, as well as managing DCA actions over time.


#### Setting parameters

The most crucial data on a Solauto position. This defines the ranges at when a rebalance is necessary and allowed. It is defined by 4 values: boost_from, boost_to, repay_from, and repay_to. This is what ensures that a leveraged position through Solauto can never get liquidated.


## Program infrastructure

Solauto uses [shank](https://crates.io/crates/shank) to define the instructions & accounts inside of [src/types/instruction.rs](src/types/instruction.rs).

Solauto also imports instruction & account types from marginfi-sdk and jupiter-sdk. These crates are generated with [metaplex kinobi](https://github.com/metaplex-foundation/kinobi) using the idls generated inside of `idls/...`. These should be updated with the idls located on mainnet at all times.


## Instructions

####  Update referral states

Required to create a referral state before other instructions. Can be updated to set the referred_by or also the lookup table.

#### Convert referral fees

Moves the referral fees earned to a token account before a jupiter swap. Validates that the destination of the swap goes to the referral state destination mint token account.

#### Claim referral fees

Claim the referral fees that have been earned. Only allowed by the "authority" of the referral state.

#### Open position (Marginfi)

Open a Solauto position, creates the Solauto position, supply & debt token accounts, Marginfi account.

#### Refresh data (Marginfi)

Reads Marginfi state data to update Solauto position state data (i.e. position balances & values in USD)

#### Protocol interaction (Marginfi)

Do a deposit, withdraw, borrow, or repay (with the Solauto position PDA as the signer if this position is not self-managed).

Only the authority of the Solauto position can invoke this instruction.

#### Rebalance (Marginfi)

The most crucial instruction and the core logic of the program: rebalance the Solauto position according to the user-defined position setting parameters and/or what data was provided in the instruction arguments.

More info can be found in the [rebalance section.](#rebalance)

#### Cancel DCA

Cancels the active DCA on the Solauto position. Only allowed to be invoked by the Solauto position authority.

#### Close position

Close the Solauto position and return all account rents. Only allowed to be invoked by the Solauto position authority.

#### Update position 

Update the Solauto position setting parameters or active DCA

## Rebalance

A rebalance can be successful under one of the 4 conditions:

- A boost (if liq utilization rate is < boost_from)
- A repay (if liq utilization rate is > repay_from)
- A DCA period is eligible
- A target liquidation utilization rate has been provided, and the position authority is signing

If none of the conditions are met, the Solauto rebalance instruction will fail.

If a rebalance is increasing leverage, Solauto will borrow extra debt, move it to a token account, swap it to the supply token, and then lend that that balance to the supply.

If a rebalance is decreasing leverage, Solauto will withdraw some supply, move it to a token account, swap it to the debt token, and then repay debt using that balance.

A rebalance will consist of multiple instructions that must exist together in the same transaction. A rebalance will be one of the 4 available sets, depending on the posiiton's state and what must be done.

1. Regular

- Rebalance
- Jup swap
- Rebalance

2. Double rebalance with flash loan

- flash borrow
- Rebalance
- Jup swap
- Rebalance
- flash repay

3. Flash loan swap then rebalance

- Flash borrow
- Jup swap
- Rebalance
- Flash repay

3. Flash loan rebalance then swap

- Flash borrow
- Rebalance
- Jup swap
- Flash repay

Depending on the rebalance set type, and the current position's state, the rebalance instruction will behave differently. 

A rebalance instruction will always validate the jup swap data & accounts to ensure there is no fee taken and the destination goes to the right token account.

If there is a flash loan, the flash loan amount will be validated to ensure the right amount of USD is changed based on the rebalance criteria.
