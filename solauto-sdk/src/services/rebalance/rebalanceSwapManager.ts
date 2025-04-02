import { QuoteResponse } from "@jup-ag/api";
import { FlashLoanRequirements } from "../../types";
import { SolautoClient } from "../solauto";
import { JupSwapManager, SwapArgs, SwapInput } from "../swap";
import { RebalanceValues } from "./rebalanceValues";
import { RebalanceDirection, TokenType } from "../../generated";
import {
  consoleLog,
  maxRepayToBps,
  safeGetPrice,
  toBaseUnit,
} from "../../utils";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";

export class RebalanceSwapManager {
  public swapArgs!: SwapArgs;
  public swapQuote?: QuoteResponse;

  jupSwapManager!: JupSwapManager;

  constructor(
    private client: SolautoClient,
    private values: RebalanceValues,
    private flRequirements?: FlashLoanRequirements,
    private targetLiqUtilizationRateBps?: number
  ) {
    this.jupSwapManager = new JupSwapManager(client.signer);
  }

  private swapDetails() {
    const input =
      this.values.rebalanceDirection === RebalanceDirection.Boost
        ? this.client.solautoPosition.state().debt
        : this.client.solautoPosition.state().supply;
    const output =
      this.values.rebalanceDirection === RebalanceDirection.Boost
        ? this.client.solautoPosition.state().supply
        : this.client.solautoPosition.state().debt;

    const usdToSwap = Math.abs(this.values.debtAdjustmentUsd);
    // TODO: add token balance change

    let inputAmount = toBaseUnit(
      usdToSwap / safeGetPrice(input.mint)!,
      input.decimals
    );

    return {
      input,
      output,
      inputAmount,
      usdToSwap,
    };
  }

  async setSwapArgs(attemptNum: number): Promise<SwapArgs> {
    const rebalanceToZero = this.targetLiqUtilizationRateBps === 0;
    let { input, output, inputAmount, usdToSwap } = this.swapDetails();

    let outputAmount = rebalanceToZero
      ? output.amountUsed.baseUnit +
        BigInt(
          Math.round(
            Number(output.amountUsed.baseUnit) *
              // Add this small percentage to account for the APR on the debt between now and the transaction
              0.0001
          )
        )
      : toBaseUnit(usdToSwap / safeGetPrice(output.mint)!, output.decimals);

    const repaying =
      this.values.rebalanceDirection === RebalanceDirection.Repay;
    const flashLoanRepayFromDebt =
      repaying &&
      this.flRequirements &&
      this.flRequirements.liquiditySource === TokenType.Debt;

    const exactOut = flashLoanRepayFromDebt && !rebalanceToZero;
    const exactIn = !exactOut;

    if (exactIn && (rebalanceToZero || this.values.repayingCloseToMaxLtv)) {
      inputAmount =
        inputAmount + BigInt(Math.round(Number(inputAmount) * 0.005));
    }

    const swapInput: SwapInput = {
      inputMint: toWeb3JsPublicKey(input.mint),
      outputMint: toWeb3JsPublicKey(output.mint),
      exactIn,
      exactOut,
      amount: exactOut ? outputAmount : inputAmount,
    };
    consoleLog(swapInput);

    if (exactIn && (rebalanceToZero || this.values.repayingCloseToMaxLtv)) {
      this.swapQuote = await findSufficientQuote(
        this.client,
        this.values,
        swapInput,
        {
          minOutputAmount: rebalanceToZero ? outputAmount : undefined,
          maxLiqUtilizationRateBps: this.values.repayingCloseToMaxLtv
            ? maxRepayToBps(
                this.client.solautoPosition.state().maxLtvBps ?? 0,
                this.client.solautoPosition.state().liqThresholdBps ?? 0
              ) - 15
            : undefined,
        }
      );
    }

    this.swapArgs = {
      ...swapInput,
      destinationWallet: flashLoanRepayFromDebt
        ? toWeb3JsPublicKey(this.client.signer.publicKey)
        : this.client.solautoPosition.publicKey,
      slippageIncFactor: 0.2 + attemptNum * 0.25,
    };
  }
}
