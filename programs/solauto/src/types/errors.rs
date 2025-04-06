use solana_program::program_error::ProgramError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SolautoError {
    #[error("Missing or incorrect accounts provided for the given instructions")]
    IncorrectAccounts,
    #[error("Failed to deserialize account data")]
    FailedAccountDeserialization,
    #[error("Invalid Boost-to param")]
    InvalidBoostToSetting,
    #[error("Invalid Boost gap param")]
    InvalidBoostGapSetting,
    #[error("Invalid repay-to param")]
    InvalidRepayToSetting,
    #[error("Invalid repay gap param")]
    InvalidRepayGapSetting,
    #[error("Invalid repay-from (repay-to + repay gap)")]
    InvalidRepayFromSetting,
    #[error("Invalid DCA configuration provided")]
    InvalidDCASettings,
    #[error("Invalid automation settings provided")]
    InvalidAutomationData,
    #[error("Invalid position condition to rebalance")]
    InvalidRebalanceCondition,
    #[error("Unable to invoke instruction through a CPI")]
    InstructionIsCPI,
    #[error("Incorrect set of instructions or instruction data in the transaction")]
    IncorrectInstructions,
    #[error("Incorrect swap amount provided. Likely due to high price volatility")]
    IncorrectDebtAdjustment,
    #[error("Invalid rebalance was made. Target supply USD and target debt USD was not met")]
    InvalidRebalanceMade,
    #[error("Cannot provide a target liquidation utilization rate if the instruction is not signed by the position authority")]
    NonAuthorityProvidedTargetLTV,
}

impl From<SolautoError> for ProgramError {
    fn from(e: SolautoError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
