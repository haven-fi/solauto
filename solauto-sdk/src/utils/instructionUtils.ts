import { OptionOrNullable, transactionBuilder } from "@metaplex-foundation/umi";
import {
  DCASettingsInpArgs,
  SolautoSettingsParametersInpArgs,
} from "../generated";
import {
  JupSwapManager,
  RebalanceTxBuilder,
  SolautoClient,
  SwapInput,
  TransactionItem,
  TransactionTooLargeError,
} from "../services";
import { PublicKey } from "@solana/web3.js";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";

export function openSolautoPosition(
  client: SolautoClient,
  settingParams: SolautoSettingsParametersInpArgs,
  dca?: DCASettingsInpArgs
) {
  return new TransactionItem(
    async () => ({
      tx: client!.openPositionIx(settingParams, dca),
    }),
    "open position"
  );
}

export function closeSolautoPosition(client: SolautoClient) {
  return new TransactionItem(
    async () => ({
      tx: client.closePositionIx(),
    }),
    "close position"
  );
}

export function updateSolautoPosition(
  client: SolautoClient,
  settings: OptionOrNullable<SolautoSettingsParametersInpArgs>,
  dca: OptionOrNullable<DCASettingsInpArgs>
) {
  return new TransactionItem(
    async () => ({
      tx: client.updatePositionIx({
        positionId: client.pos.positionId,
        settings,
        dca,
      }),
    }),
    "update position"
  );
}

export function cancelSolautoDca(client: SolautoClient) {
  return new TransactionItem(
    async () => ({
      tx: client.cancelDCAIx(),
    }),
    "cancel DCA"
  );
}

export function deposit(client: SolautoClient, baseUnitAmount: bigint) {
  return new TransactionItem(
    async () => ({
      tx: client.protocolInteractionIx({
        __kind: "Deposit",
        fields: [baseUnitAmount],
      }),
    }),
    "deposit"
  );
}

export function borrow(client: SolautoClient, baseUnitAmount: bigint) {
  return new TransactionItem(
    async () => ({
      tx: client.protocolInteractionIx({
        __kind: "Borrow",
        fields: [baseUnitAmount],
      }),
    }),
    "borrow",
    true
  );
}

export function withdraw(client: SolautoClient, amount: "All" | bigint) {
  return new TransactionItem(
    async () => ({
      tx: client.protocolInteractionIx({
        __kind: "Withdraw",
        fields: [
          amount === "All"
            ? { __kind: "All" }
            : { __kind: "Some", fields: [amount] },
        ],
      }),
    }),
    "withdraw",
    true
  );
}

export function repay(client: SolautoClient, amount: "All" | bigint) {
  return new TransactionItem(
    async () => ({
      tx: client.protocolInteractionIx({
        __kind: "Repay",
        fields: [
          amount === "All"
            ? { __kind: "All" }
            : { __kind: "Some", fields: [amount] },
        ],
      }),
    }),
    "repay"
  );
}

export function rebalance(
  client: SolautoClient,
  targetLiqUtilizationRateBps?: number,
  bpsDistanceFromRebalance?: number
) {
  return new TransactionItem(
    async (attemptNum, prevError) =>
      await new RebalanceTxBuilder(
        client,
        targetLiqUtilizationRateBps,
        attemptNum > 2 && prevError instanceof TransactionTooLargeError,
        bpsDistanceFromRebalance
      ).buildRebalanceTx(attemptNum),
    "rebalance",
    true
  );
}

export function swapThenDeposit(
  client: SolautoClient,
  depositMint: PublicKey,
  depositAmountBaseUnit: bigint
) {
  return [
    new TransactionItem(async () => {
      const swapInput: SwapInput = {
        inputMint: depositMint,
        outputMint: client.pos.supplyMint,
        amount: depositAmountBaseUnit,
        exactIn: true,
      };
      const jupSwapManager = new JupSwapManager(client.signer);
      const { setupIx, swapIx, cleanupIx, lookupTableAddresses } =
        await jupSwapManager.getJupSwapTxData({
          ...swapInput,
          destinationWallet: toWeb3JsPublicKey(client.signer.publicKey),
          wrapAndUnwrapSol: true,
        });

      client.contextUpdates.new({
        type: "jupSwap",
        value: jupSwapManager.jupQuote!,
      });

      return {
        tx: transactionBuilder().add([setupIx, swapIx, cleanupIx]),
        lookupTableAddresses,
        orderPrio: -1,
      };
    }, "swap"),
    new TransactionItem(async () => {
      const quoteOutAmount = client.contextUpdates.jupSwap?.outAmount;
      return {
        tx: transactionBuilder().add(
          client.protocolInteractionIx({
            __kind: "Deposit",
            fields: [BigInt(Math.round(parseInt(quoteOutAmount!) * 0.995))],
          })
        ),
      };
    }, "deposit"),
  ];
}
