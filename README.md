# Solauto

## Overview

Solauto is a program on the Solana blockchain that lets you manage leveraged longs & shorts on auto-pilot to maximize your gains and eliminate the risk of liquidation.

See the [Program documentation](/programs/solauto/README.md) for more info on the underlying Solana program.

### Repository Dependencies

- Rust
- PNPM

```
crate install shank-idl
rustup component add rustfmt
pnpm install -g ts-node
```

Define `IRONFORGE_API_KEY` environment variable for running package tests/scripts locally.

### Building

```bash
# Build typescript
pnpm build:ts

# Build Solauto test program
pnpm build:rs:test

# Build Solauto prod program
pnpm build:rs:prod
```

### Testing

```bash
# Run all tests
pnpm test:all

# Run unit tests
pnpm test:unit

# Run transaction tests
pnpm test:txs
```


## Solauto Typescript SDK

The Solauto Typescript SDK is made for interacting with the Solauto program on the Solana blockchain. This SDK provides tools for managing, & reading Solauto state data, as well as executing transactions.

```bash
npm install @haven-fi/solauto-sdk
# or
yarn add @haven-fi/solauto-sdk
# or
pnpm add @haven-fi/solauto-sdk
```

## Basic Usage

```typescript
import { PublicKey } from "@solana/web3.js";
import {
  getClient,
  LendingPlatform,
  USDC,
  SolautoSettingsParametersInpArgs,
  maxBoostToBps,
  maxRepayToBps,
  fetchTokenPrices,
  TransactionItem,
  solautoAction,
  RebalanceTxBuilder,
  TransactionsManager,
} from "@haven-fi/solauto-sdk";

// Initialize the client
const client = getClient(LendingPlatform.MARGINFI, {
  signer: yourSigner,
  rpcUrl: "[YOUR_RPC_URL]",
});

const supplyMint = new PublicKey(NATIVE_MINT);
const debtMint = new PublicKey(USDC);

// Initialize a new position
await client.initialize({
  positionId: 1,
  new: true,
  supplyMint,
  debtMint,
});

// Open a position with custom settings
const [maxLtvBps, liqThresholdBps] =
  await client.pos.maxLtvAndLiqThresholdBps();
const settings: SolautoSettingsParametersInpArgs = {
  boostToBps: maxBoostToBps(maxLtvBps, liqThresholdBps),
  boostGap: 50,
  repayToBps: maxRepayToBps(maxLtvBps, liqThresholdBps),
  repayGap: 50,
};

const [supplyPrice, debtPrice] = await fetchTokenPrices([supplyMint, debtMint]);

const transactionItems: TransactionItem[] = [];

transactionItems.push(
  new TransactionItem(async () => {
    return {
      tx: client.openPositionIx(settings),
    };
  }, "open position")
);

const debtUsd = withFlashLoan ? 60 : 10;
transactionItems.push(
  new TransactionItem(async () => {
    return {
      tx: client.protocolInteractionIx(
        solautoAction("Borrow", [
          toBaseUnit(debtUsd / debtPrice, client.pos.debtMintInfo().decimals),
        ])
      ),
    };
  }, "borrow")
);

transactionItems.push(
  new TransactionItem(
    async (attemptNum) =>
      await new RebalanceTxBuilder(client, 0).buildRebalanceTx(attemptNum),
    "rebalance"
  )
);

transactionItems.push(
  new TransactionItem(
    async () => ({
      tx: client.protocolInteractionIx(
        solautoAction("Withdraw", [{ __kind: "All" }])
      ),
    }),
    "withdraw"
  )
);

transactionItems.push(
  new TransactionItem(
    async () => ({
      tx: client.closePositionIx(),
    }),
    "close position"
  )
);

const txManager = new TransactionsManager(client);
const statuses = await txManager.clientSend(transactionItems);
```