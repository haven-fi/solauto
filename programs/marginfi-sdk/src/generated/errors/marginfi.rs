//! This code was AUTOGENERATED using the kinobi library.
//! Please DO NOT EDIT THIS FILE, instead use visitors
//! to add features, then rerun kinobi to update it.
//!
//! [https://github.com/metaplex-foundation/kinobi]
//!

use num_derive::FromPrimitive;
use thiserror::Error;

#[derive(Clone, Debug, Eq, Error, FromPrimitive, PartialEq)]
pub enum MarginfiError {
    /// 6000 (0x1770) - Internal Marginfi logic error
    #[error("Internal Marginfi logic error")]
    InternalLogicError,
    /// 6001 (0x1771) - Invalid bank index
    #[error("Invalid bank index")]
    BankNotFound,
    /// 6002 (0x1772) - Lending account balance not found
    #[error("Lending account balance not found")]
    LendingAccountBalanceNotFound,
    /// 6003 (0x1773) - Bank deposit capacity exceeded
    #[error("Bank deposit capacity exceeded")]
    BankAssetCapacityExceeded,
    /// 6004 (0x1774) - Invalid transfer
    #[error("Invalid transfer")]
    InvalidTransfer,
    /// 6005 (0x1775) - Missing Oracle, Bank, LST mint, or Sol Pool
    #[error("Missing Oracle, Bank, LST mint, or Sol Pool")]
    MissingPythOrBankAccount,
    /// 6006 (0x1776) - Missing Pyth account
    #[error("Missing Pyth account")]
    MissingPythAccount,
    /// 6007 (0x1777) - Missing Bank account
    #[error("Missing Bank account")]
    MissingBankAccount,
    /// 6008 (0x1778) - Invalid Bank account
    #[error("Invalid Bank account")]
    InvalidBankAccount,
    /// 6009 (0x1779) - RiskEngine rejected due to either bad health or stale oracles
    #[error("RiskEngine rejected due to either bad health or stale oracles")]
    RiskEngineInitRejected,
    /// 6010 (0x177A) - Lending account balance slots are full
    #[error("Lending account balance slots are full")]
    LendingAccountBalanceSlotsFull,
    /// 6011 (0x177B) - Bank already exists
    #[error("Bank already exists")]
    BankAlreadyExists,
    /// 6012 (0x177C) - Amount to liquidate must be positive
    #[error("Amount to liquidate must be positive")]
    ZeroLiquidationAmount,
    /// 6013 (0x177D) - Account is not bankrupt
    #[error("Account is not bankrupt")]
    AccountNotBankrupt,
    /// 6014 (0x177E) - Account balance is not bad debt
    #[error("Account balance is not bad debt")]
    BalanceNotBadDebt,
    /// 6015 (0x177F) - Invalid group config
    #[error("Invalid group config")]
    InvalidConfig,
    /// 6016 (0x1780) - Bank paused
    #[error("Bank paused")]
    BankPaused,
    /// 6017 (0x1781) - Bank is ReduceOnly mode
    #[error("Bank is ReduceOnly mode")]
    BankReduceOnly,
    /// 6018 (0x1782) - Bank is missing
    #[error("Bank is missing")]
    BankAccountNotFound,
    /// 6019 (0x1783) - Operation is deposit-only
    #[error("Operation is deposit-only")]
    OperationDepositOnly,
    /// 6020 (0x1784) - Operation is withdraw-only
    #[error("Operation is withdraw-only")]
    OperationWithdrawOnly,
    /// 6021 (0x1785) - Operation is borrow-only
    #[error("Operation is borrow-only")]
    OperationBorrowOnly,
    /// 6022 (0x1786) - Operation is repay-only
    #[error("Operation is repay-only")]
    OperationRepayOnly,
    /// 6023 (0x1787) - No asset found
    #[error("No asset found")]
    NoAssetFound,
    /// 6024 (0x1788) - No liability found
    #[error("No liability found")]
    NoLiabilityFound,
    /// 6025 (0x1789) - Invalid oracle setup
    #[error("Invalid oracle setup")]
    InvalidOracleSetup,
    /// 6026 (0x178A) - Invalid bank utilization ratio
    #[error("Invalid bank utilization ratio")]
    IllegalUtilizationRatio,
    /// 6027 (0x178B) - Bank borrow cap exceeded
    #[error("Bank borrow cap exceeded")]
    BankLiabilityCapacityExceeded,
    /// 6028 (0x178C) - Invalid Price
    #[error("Invalid Price")]
    InvalidPrice,
    /// 6029 (0x178D) - Account can have only one liability when account is under isolated risk
    #[error("Account can have only one liability when account is under isolated risk")]
    IsolatedAccountIllegalState,
    /// 6030 (0x178E) - Emissions already setup
    #[error("Emissions already setup")]
    EmissionsAlreadySetup,
    /// 6031 (0x178F) - Oracle is not set
    #[error("Oracle is not set")]
    OracleNotSetup,
    /// 6032 (0x1790) - Invalid switchboard decimal conversion
    #[error("Invalid switchboard decimal conversion")]
    InvalidSwitchboardDecimalConversion,
    /// 6033 (0x1791) - Cannot close balance because of outstanding emissions
    #[error("Cannot close balance because of outstanding emissions")]
    CannotCloseOutstandingEmissions,
    /// 6034 (0x1792) - Update emissions error
    #[error("Update emissions error")]
    EmissionsUpdateError,
    /// 6035 (0x1793) - Account disabled
    #[error("Account disabled")]
    AccountDisabled,
    /// 6036 (0x1794) - Account can't temporarily open 3 balances, please close a balance first
    #[error("Account can't temporarily open 3 balances, please close a balance first")]
    AccountTempActiveBalanceLimitExceeded,
    /// 6037 (0x1795) - Illegal action during flashloan
    #[error("Illegal action during flashloan")]
    AccountInFlashloan,
    /// 6038 (0x1796) - Illegal flashloan
    #[error("Illegal flashloan")]
    IllegalFlashloan,
    /// 6039 (0x1797) - Illegal flag
    #[error("Illegal flag")]
    IllegalFlag,
    /// 6040 (0x1798) - Illegal balance state
    #[error("Illegal balance state")]
    IllegalBalanceState,
    /// 6041 (0x1799) - Illegal account authority transfer
    #[error("Illegal account authority transfer")]
    IllegalAccountAuthorityTransfer,
    /// 6042 (0x179A) - Unauthorized
    #[error("Unauthorized")]
    Unauthorized,
    /// 6043 (0x179B) - Invalid account authority
    #[error("Invalid account authority")]
    IllegalAction,
    /// 6044 (0x179C) - Token22 Banks require mint account as first remaining account
    #[error("Token22 Banks require mint account as first remaining account")]
    T22MintRequired,
    /// 6045 (0x179D) - Invalid ATA for global fee account
    #[error("Invalid ATA for global fee account")]
    InvalidFeeAta,
    /// 6046 (0x179E) - Use add pool permissionless instead
    #[error("Use add pool permissionless instead")]
    AddedStakedPoolManually,
    /// 6047 (0x179F) - Staked SOL accounts can only deposit staked assets and borrow SOL
    #[error("Staked SOL accounts can only deposit staked assets and borrow SOL")]
    AssetTagMismatch,
    /// 6048 (0x17A0) - Stake pool validation failed: check the stake pool, mint, or sol pool
    #[error("Stake pool validation failed: check the stake pool, mint, or sol pool")]
    StakePoolValidationFailed,
    /// 6049 (0x17A1) - Switchboard oracle: stale price
    #[error("Switchboard oracle: stale price")]
    SwitchboardStalePrice,
    /// 6050 (0x17A2) - Pyth Push oracle: stale price
    #[error("Pyth Push oracle: stale price")]
    PythPushStalePrice,
    /// 6051 (0x17A3) - Oracle error: wrong number of accounts
    #[error("Oracle error: wrong number of accounts")]
    WrongNumberOfOracleAccounts,
    /// 6052 (0x17A4) - Oracle error: wrong account keys
    #[error("Oracle error: wrong account keys")]
    WrongOracleAccountKeys,
    /// 6053 (0x17A5) - Pyth Push oracle: wrong account owner
    #[error("Pyth Push oracle: wrong account owner")]
    PythPushWrongAccountOwner,
    /// 6054 (0x17A6) - Staked Pyth Push oracle: wrong account owner
    #[error("Staked Pyth Push oracle: wrong account owner")]
    StakedPythPushWrongAccountOwner,
    /// 6055 (0x17A7) - Pyth Push oracle: mismatched feed id
    #[error("Pyth Push oracle: mismatched feed id")]
    PythPushMismatchedFeedId,
    /// 6056 (0x17A8) - Pyth Push oracle: insufficient verification level
    #[error("Pyth Push oracle: insufficient verification level")]
    PythPushInsufficientVerificationLevel,
    /// 6057 (0x17A9) - Pyth Push oracle: feed id must be 32 Bytes
    #[error("Pyth Push oracle: feed id must be 32 Bytes")]
    PythPushFeedIdMustBe32Bytes,
    /// 6058 (0x17AA) - Pyth Push oracle: feed id contains non-hex characters
    #[error("Pyth Push oracle: feed id contains non-hex characters")]
    PythPushFeedIdNonHexCharacter,
    /// 6059 (0x17AB) - Switchboard oracle: wrong account owner
    #[error("Switchboard oracle: wrong account owner")]
    SwitchboardWrongAccountOwner,
    /// 6060 (0x17AC) - Pyth Push oracle: invalid account
    #[error("Pyth Push oracle: invalid account")]
    PythPushInvalidAccount,
    /// 6061 (0x17AD) - Switchboard oracle: invalid account
    #[error("Switchboard oracle: invalid account")]
    SwitchboardInvalidAccount,
    /// 6062 (0x17AE) - Math error
    #[error("Math error")]
    MathError,
    /// 6063 (0x17AF) - Invalid emissions destination account
    #[error("Invalid emissions destination account")]
    InvalidEmissionsDestinationAccount,
    /// 6064 (0x17B0) - Asset and liability bank cannot be the same
    #[error("Asset and liability bank cannot be the same")]
    SameAssetAndLiabilityBanks,
    /// 6065 (0x17B1) - Trying to withdraw more assets than available
    #[error("Trying to withdraw more assets than available")]
    OverliquidationAttempt,
    /// 6066 (0x17B2) - Liability bank has no liabilities
    #[error("Liability bank has no liabilities")]
    NoLiabilitiesInLiabilityBank,
    /// 6067 (0x17B3) - Liability bank has assets
    #[error("Liability bank has assets")]
    AssetsInLiabilityBank,
    /// 6068 (0x17B4) - Account is healthy and cannot be liquidated
    #[error("Account is healthy and cannot be liquidated")]
    HealthyAccount,
    /// 6069 (0x17B5) - Liability payoff too severe, exhausted liability
    #[error("Liability payoff too severe, exhausted liability")]
    ExhaustedLiability,
    /// 6070 (0x17B6) - Liability payoff too severe, liability balance has assets
    #[error("Liability payoff too severe, liability balance has assets")]
    TooSeverePayoff,
    /// 6071 (0x17B7) - Liquidation too severe, account above maintenance requirement
    #[error("Liquidation too severe, account above maintenance requirement")]
    TooSevereLiquidation,
    /// 6072 (0x17B8) - Liquidation would worsen account health
    #[error("Liquidation would worsen account health")]
    WorseHealthPostLiquidation,
    /// 6073 (0x17B9) - Arena groups can only support two banks
    #[error("Arena groups can only support two banks")]
    ArenaBankLimit,
    /// 6074 (0x17BA) - Arena groups cannot return to non-arena status
    #[error("Arena groups cannot return to non-arena status")]
    ArenaSettingCannotChange,
}

impl solana_program::program_error::PrintProgramError for MarginfiError {
    fn print<E>(&self) {
        solana_program::msg!(&self.to_string());
    }
}
