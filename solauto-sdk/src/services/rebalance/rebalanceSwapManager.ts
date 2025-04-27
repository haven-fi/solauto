import { QuoteResponse } from "@jup-ag/api";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { FlashLoanRequirements } from "../../types";
import { SolautoClient } from "../solauto";
import { JupSwapManager, SwapParams, SwapInput } from "../swap";
import { applyDebtAdjustmentUsd, RebalanceValues } from "./rebalanceValues";
import { PriceType, RebalanceDirection, TokenType } from "../../generated";
import {
  bytesToI80F48,
  consoleLog,
  fromBaseUnit,
  fromBps,
  getLiqUtilzationRateBps,
  isMarginfiPosition,
  safeGetPrice,
  toBaseUnit,
  tokenInfo,
} from "../../utils";
import { SolautoFeesBps } from "./solautoFees";

export class RebalanceSwapManager {
  public swapParams!: SwapParams;
  public swapQuote?: QuoteResponse;
  public flBorrowAmount?: bigint;

  private jupSwapManager!: JupSwapManager;
  private solautoFeeBps!: number;

  constructor(
    private client: SolautoClient,
    private values: RebalanceValues,
    private flRequirements?: FlashLoanRequirements,
    private targetLiqUtilizationRateBps?: number,
    private priceType?: PriceType
  ) {
    this.jupSwapManager = new JupSwapManager(client.signer);
    this.solautoFeeBps = SolautoFeesBps.create(
      this.client.isReferred,
      this.targetLiqUtilizationRateBps,
      this.client.pos.netWorthUsd(this.priceType)
    ).getSolautoFeesBps(values.rebalanceDirection).total;
  }

  private isBoost() {
    return this.values.rebalanceDirection === RebalanceDirection.Boost;
  }

  private usdToSwap() {
    return Math.abs(this.values.debtAdjustmentUsd);
  }

  private swapDetails() {
    const input = this.isBoost()
      ? this.client.pos.state.debt
      : this.client.pos.state.supply;
    const output = this.isBoost()
      ? this.client.pos.state.supply
      : this.client.pos.state.debt;

    const inputPrice = safeGetPrice(
      toWeb3JsPublicKey(input.mint),
      this.priceType
    )!;
    const outputPrice = safeGetPrice(
      toWeb3JsPublicKey(output.mint),
      this.priceType
    )!;

    const supplyPrice = this.client.pos.supplyPrice(this.priceType)!;
    const debtPrice = this.client.pos.debtPrice(this.priceType)!;
    const biasedInputPrice = this.isBoost() ? debtPrice : supplyPrice;
    const biasedOutputPrice = this.isBoost() ? supplyPrice : debtPrice;

    let inputAmount = toBaseUnit(
      this.usdToSwap() / biasedInputPrice!,
      input.decimals
    );

    return {
      inputAmount,
      input,
      inputPrice,
      biasedInputPrice,
      output,
      outputPrice,
      biasedOutputPrice,
    };
  }

  private postRebalanceLiqUtilizationRateBps(
    swapOutputAmountBaseUnit?: bigint,
    swapInputAmountBaseUnit?: bigint
  ) {
    let supplyUsd = this.client.pos.supplyUsd(this.priceType);
    let debtUsd = this.client.pos.debtUsd(this.priceType);
    // TODO: add token balance change

    const {
      input,
      biasedInputPrice,
      output,
      biasedOutputPrice,
    } = this.swapDetails();

    const swapInputAmount = swapInputAmountBaseUnit
      ? fromBaseUnit(
          swapInputAmountBaseUnit,
          tokenInfo(toWeb3JsPublicKey(input.mint)).decimals
        )
      : undefined;

    const swapOutputAmount = swapOutputAmountBaseUnit
      ? fromBaseUnit(
          swapOutputAmountBaseUnit,
          tokenInfo(toWeb3JsPublicKey(output.mint)).decimals
        )
      : undefined;

    const swapInputUsd = swapInputAmount
      ? swapInputAmount * biasedInputPrice
      : this.usdToSwap();

    const swapOutputUsd = swapOutputAmount
      ? swapOutputAmount * biasedOutputPrice
      : this.usdToSwap();

    const res = applyDebtAdjustmentUsd(
      {
        debtAdjustmentUsd: this.isBoost() ? swapInputUsd : swapInputUsd * -1,
        debtAdjustmentUsdOutput: this.isBoost() ? swapOutputUsd : swapOutputUsd * -1,
      },
      { supplyUsd, debtUsd },
      fromBps(this.client.pos.state.liqThresholdBps),
      {
        solauto: this.solautoFeeBps,
        flashLoan: this.flRequirements?.flFeeBps ?? 0,
        lpBorrow: this.client.pos.state.debt.borrowFeeBps,
      }
    );

    // if (isMarginfiPosition(this.client.pos)) {
    //   console.log(res.newPos.supplyUsd, res.newPos.debtUsd);
    //   console.log(
    //     res.newPos.supplyUsd *
    //       bytesToI80F48(
    //         this.client.pos.supplyBank!.config.assetWeightInit.value
    //       ),
    //     res.newPos.debtUsd *
    //       bytesToI80F48(
    //         this.client.pos.debtBank!.config.liabilityWeightInit.value
    //       )
    //   );
    // }

    return getLiqUtilzationRateBps(
      res.newPos.supplyUsd,
      res.newPos.debtUsd,
      this.client.pos.state.liqThresholdBps ?? 0
    );
  }

  private async findSufficientQuote(
    swapInput: SwapInput,
    criteria: {
      minOutputAmount?: bigint;
      maxLiqUtilizationRateBps?: number;
    }
  ): Promise<QuoteResponse> {
    let swapQuote: QuoteResponse;
    let insufficient: boolean = false;

    for (let i = 0; i < 20; i++) {
      consoleLog("Finding sufficient quote...");
      swapQuote = await this.jupSwapManager.getQuote(swapInput);

      const outputAmount = parseInt(swapQuote.outAmount);
      const postRebalanceRate = this.postRebalanceLiqUtilizationRateBps(
        BigInt(outputAmount),
        BigInt(parseInt(swapQuote.inAmount))
      );
      const exceedsMinOutput = criteria.minOutputAmount
      ? outputAmount < Number(criteria.minOutputAmount) : false;
      const exceedsMaxRate = criteria.maxLiqUtilizationRateBps ? postRebalanceRate > criteria.maxLiqUtilizationRateBps : false;
      insufficient = exceedsMinOutput || exceedsMaxRate;

      consoleLog(postRebalanceRate, criteria.maxLiqUtilizationRateBps);
      if (insufficient) {
        consoleLog("Insufficient swap quote:", swapQuote);

        const increment = 0.01 + i * 0.01;
        swapInput.amount = this.bigIntWithIncrement(
          swapInput.amount,
          this.isBoost() ? increment * -1 : increment
        );
      } else {
        break;
      }
    }

    return swapQuote!;
  }

  private bigIntWithIncrement(num: bigint, inc: number) {
    return num + BigInt(Math.round(Number(num) * inc));
  }

  async setSwapParams(attemptNum: number) {
    const rebalanceToZero = this.targetLiqUtilizationRateBps === 0;
    let { input, output, biasedOutputPrice, inputAmount } = this.swapDetails();

    let outputAmount = rebalanceToZero
      ? output.amountUsed.baseUnit +
        BigInt(
          Math.round(
            Number(output.amountUsed.baseUnit) *
              // Add this small percentage to account for the APR on the debt between now and the transaction
              0.0001
          )
        )
      : toBaseUnit(this.usdToSwap() / biasedOutputPrice, output.decimals);

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

    if (exactIn) {
      this.swapQuote = await this.findSufficientQuote(swapInput, {
        minOutputAmount: rebalanceToZero ? outputAmount : undefined,
        maxLiqUtilizationRateBps: !rebalanceToZero
          ? this.client.pos.maxBoostToBps
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
