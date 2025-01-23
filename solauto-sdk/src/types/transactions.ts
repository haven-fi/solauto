export interface BundleInstructionFailure {
  transactionIdx: number;
  instructionIdx: number;
  errorCode: number;
}

export class BundleSimulationError extends Error {
  public statusCode: number;
  public details: BundleInstructionFailure;

  constructor(
    message: string,
    statusCode: number,
    details: BundleInstructionFailure
  ) {
    super(message);

    this.statusCode = statusCode;
    this.details = details;

    Object.setPrototypeOf(this, BundleSimulationError.prototype);
  }
}
