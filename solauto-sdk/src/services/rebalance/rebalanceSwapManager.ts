import { QuoteResponse } from "@jup-ag/api";
import { FlashLoanRequirements } from "../../types";
import { SolautoClient } from "../solauto";
import { JupSwapManager, SwapParams, SwapInput } from "../swap";
import { RebalanceValues } from "./rebalanceValues";
import { RebalanceDirection, TokenType } from "../../generated";
import {
  consoleLog,
  fromBaseUnit,
  getLiqUtilzationRateBps,
  maxRepayToBps,
  safeGetPrice,
  toBaseUnit,
  tokenInfo,
} from "../../utils";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";

export class RebalanceSwapManager {
  public swapParams!: SwapParams;
  public swapQuote?: QuoteResponse;
  public flBorrowAmount?: bigint;

  private jupSwapManager!: JupSwapManager;

  constructor(
    private client: SolautoClient,
    private values: RebalanceValues,
    private flRequirements?: FlashLoanRequirements,
    private targetLiqUtilizationRateBps?: number
  ) {
    this.jupSwapManager = new JupSwapManager(client.signer);
  }

  private isBoost() {
    return this.values.rebalanceDirection === RebalanceDirection.Boost;
  }

  private usdToSwap() {
    return Math.abs(this.values.debtAdjustmentUsd);
  }

  private postRebalanceLiqUtilizationRateBps(swapOutputAmount?: bigint) {
    let supplyUsd = this.client.solautoPosition.supplyUsd();
    // TODO: add token balance change
    let debtUsd = this.client.solautoPosition.debtUsd();

    const outputToken = toWeb3JsPublicKey(
      this.isBoost()
        ? this.client.solautoPosition.state().supply.mint
        : this.client.solautoPosition.state().debt.mint
    );
    const swapOutputUsd = swapOutputAmount
      ? fromBaseUnit(swapOutputAmount, tokenInfo(outputToken).decimals) *
        (safeGetPrice(outputToken) ?? 0)
      : this.usdToSwap();

    supplyUsd = this.isBoost()
      ? supplyUsd + swapOutputUsd
      : supplyUsd - this.usdToSwap();
    debtUsd = this.isBoost()
      ? debtUsd + this.usdToSwap()
      : debtUsd - swapOutputUsd;

    return getLiqUtilzationRateBps(
      supplyUsd,
      debtUsd,
      this.client.solautoPosition.state().liqThresholdBps ?? 0
    );
  }

  private async findSufficientQuote(
    swapInput: SwapInput,
    criteria: {
      minOutputAmount?: bigint;
      minLiqUtilizationRateBps?: number;
      maxLiqUtilizationRateBps?: number;
    }
  ): Promise<QuoteResponse> {
    let swapQuote: QuoteResponse;
    let insufficient: boolean = false;

    for (let i = 0; i < 10; i++) {
      consoleLog("Finding sufficient quote...");
      swapQuote = await this.jupSwapManager.getQuote(swapInput);

      const outputAmount = parseInt(swapQuote.outAmount);
      const postRebalanceRate = this.postRebalanceLiqUtilizationRateBps(
        BigInt(outputAmount)
      );
      insufficient = criteria.minOutputAmount
        ? outputAmount < Number(criteria.minOutputAmount)
        : criteria.minLiqUtilizationRateBps
          ? postRebalanceRate < criteria.minLiqUtilizationRateBps
          : postRebalanceRate > criteria.maxLiqUtilizationRateBps!;

      if (insufficient) {
        consoleLog(swapQuote);
        swapInput.amount = this.bigIntWithIncrement(swapInput.amount, 0.01);
      } else {
        break;
      }
    }

    return swapQuote!;
  }

  private swapDetails() {
    const input = this.isBoost()
      ? this.client.solautoPosition.state().debt
      : this.client.solautoPosition.state().supply;
    const output = this.isBoost()
      ? this.client.solautoPosition.state().supply
      : this.client.solautoPosition.state().debt;

    let inputAmount = toBaseUnit(
      this.usdToSwap() / safeGetPrice(input.mint)!,
      input.decimals
    );

    return {
      input,
      output,
      inputAmount,
    };
  }

  private bigIntWithIncrement(num: bigint, inc: number) {
    return num + BigInt(Math.round(Number(num) * inc));
  }

  async setSwapParams(attemptNum: number) {
    const rebalanceToZero = this.targetLiqUtilizationRateBps === 0;
    let { input, output, inputAmount } = this.swapDetails();

    let outputAmount = rebalanceToZero
      ? output.amountUsed.baseUnit +
        BigInt(
          Math.round(
            Number(output.amountUsed.baseUnit) *
              // Add this small percentage to account for the APR on the debt between now and the transaction
              0.0001
          )
        )
      : toBaseUnit(
          this.usdToSwap() / safeGetPrice(output.mint)!,
          output.decimals
        );

    const flashLoanRepayFromDebt =
      !this.isBoost() &&
      this.flRequirements &&
      this.flRequirements.liquiditySource === TokenType.Debt;

    const exactOut = flashLoanRepayFromDebt && !rebalanceToZero;
    const exactIn = !exactOut;

    if (exactIn && (rebalanceToZero || this.values.repayingCloseToMaxLtv)) {
      inputAmount = this.bigIntWithIncrement(inputAmount, 0.005);
    }

    const swapAmount = exactOut
      ? this.flRequirements
        ? this.bigIntWithIncrement(
            outputAmount,
            this.flRequirements.flFeeBps ?? 0
          )
        : outputAmount
      : inputAmount;
    const swapInput: SwapInput = {
      inputMint: toWeb3JsPublicKey(input.mint),
      outputMint: toWeb3JsPublicKey(output.mint),
      exactIn,
      exactOut,
      amount: swapAmount,
    };
    consoleLog(swapInput);

    if (exactIn && (rebalanceToZero || this.values.repayingCloseToMaxLtv)) {
      this.swapQuote = await this.findSufficientQuote(swapInput, {
        minOutputAmount: rebalanceToZero ? outputAmount : undefined,
        maxLiqUtilizationRateBps: this.values.repayingCloseToMaxLtv
          ? maxRepayToBps(
              this.client.solautoPosition.state().maxLtvBps ?? 0,
              this.client.solautoPosition.state().liqThresholdBps ?? 0
            ) - 15
          : undefined,
      });
    }

    if (this.flRequirements) {
      this.flBorrowAmount = exactOut
        ? outputAmount
        : this.swapQuote
          ? BigInt(parseInt(this.swapQuote.inAmount))
          : inputAmount;
    }

    this.swapParams = {
      ...swapInput,
      destinationWallet: flashLoanRepayFromDebt
        ? toWeb3JsPublicKey(this.client.signer.publicKey)
        : this.client.solautoPosition.publicKey,
      slippageIncFactor: 0.2 + attemptNum * 0.25,
    };
  }

  async getSwapTxData() {
    const { jupQuote, lookupTableAddresses, setupInstructions, swapIx } =
      await this.jupSwapManager.getJupSwapTxData(this.swapParams);

    return {
      swapQuote: jupQuote,
      lookupTableAddresses,
      setupInstructions,
      swapIx,
    };
  }
}
