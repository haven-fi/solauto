import { QuoteResponse } from "@jup-ag/api";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { FlashLoanRequirements } from "../../types";
import { SolautoClient } from "../solauto";
import { JupSwapManager, SwapParams, SwapInput } from "../swap";
import { RebalanceValues } from "./rebalanceValues";
import { RebalanceDirection, TokenType } from "../../generated";
import {
  consoleLog,
  fromBaseUnit,
  getLiqUtilzationRateBps,
  safeGetPrice,
  toBaseUnit,
  tokenInfo,
} from "../../utils";

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
    let supplyUsd = this.client.pos.supplyUsd();
    // TODO: add token balance change
    let debtUsd = this.client.pos.debtUsd();

    const outputToken = this.isBoost()
      ? this.client.pos.supplyMint
      : this.client.pos.debtMint;
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
      this.client.pos.state.liqThresholdBps ?? 0
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
        consoleLog("Insufficient swap quote:", swapQuote);
        swapInput.amount = this.bigIntWithIncrement(swapInput.amount, 0.01);
      } else {
        break;
      }
    }

    return swapQuote!;
  }

  private swapDetails() {
    const input = this.isBoost()
      ? this.client.pos.state.debt
      : this.client.pos.state.supply;
    const output = this.isBoost()
      ? this.client.pos.state.supply
      : this.client.pos.state.debt;

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

    const exactOut = flashLoanRepayFromDebt;
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

    const inputMint = toWeb3JsPublicKey(input.mint);
    const outputMint = toWeb3JsPublicKey(output.mint);
    const swapInput: SwapInput = {
      inputMint,
      outputMint,
      exactIn,
      exactOut,
      amount: swapAmount,
    };
    consoleLog("Swap input:", swapInput);

    if (exactIn && (rebalanceToZero || this.values.repayingCloseToMaxLtv)) {
      this.swapQuote = await this.findSufficientQuote(swapInput, {
        minOutputAmount: rebalanceToZero ? outputAmount : undefined,
        maxLiqUtilizationRateBps: this.values.repayingCloseToMaxLtv
          ? this.client.pos.maxRepayToBps - 15
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
      destinationWallet: exactOut
        ? toWeb3JsPublicKey(this.client.signer.publicKey)
        : this.client.pos.publicKey,
      slippageIncFactor: 0.2 + attemptNum * 0.25,
    };
  }

  async getSwapTxData() {
    const { jupQuote, lookupTableAddresses, setupIx, swapIx } =
      await this.jupSwapManager.getJupSwapTxData(this.swapParams);

    return {
      swapQuote: jupQuote,
      lookupTableAddresses,
      setupIx,
      swapIx,
    };
  }
}
