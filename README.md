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
# If running rust tests, build program first
pnpm build:rs:local

# Run all rust & typescript tests
pnpm test:all

# Run all rust tests
pnpm test:rs:all

# Run all typescript tests
pnpm test:ts:all
```

## Solauto Typescript SDK

The Solauto typescript SDK is made for interacting with the Solauto program. This SDK provides tools for managing, & reading Solauto state data, as well as executing transactions.

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

// Open position
transactionItems.push(
  new TransactionItem(async () => {
    return {
      tx: client.openPositionIx(settings),
    };
  }, "open position")
);

const supplyUsdToDeposit = 100;
const debtUsdToBorrow = 60;

// Deposit supply (SOL) transaction
transactionItems.push(
  new TransactionItem(async () => {
    return {
      tx: client.protocolInteractionIx(
        solautoAction("Deposit", [
          toBaseUnit(
            supplyUsdToDeposit / supplyPrice,
            client.pos.supplyMintInfo().decimals
          ),
        ])
      ),
    };
  }, "deposit")
);

// Borrow debt (USDC) transaction
transactionItems.push(
  new TransactionItem(async () => {
    return {
      tx: client.protocolInteractionIx(
        solautoAction("Borrow", [
          toBaseUnit(
            debtUsdToBorrow / debtPrice,
            client.pos.debtMintInfo().decimals
          ),
        ])
      ),
    };
  }, "borrow")
);

// Rebalance to 0 LTV (repays all debt using collateral)
const rebalanceTo = 0;
transactionItems.push(
  new TransactionItem(
    async (attemptNum) =>
      await new RebalanceTxBuilder(client, 0).buildRebalanceTx(attemptNum),
    "rebalance"
  )
);

// Withdraw remaining supply in position
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

// Close position
transactionItems.push(
  new TransactionItem(
    async () => ({
      tx: client.closePositionIx(),
    }),
    "close position"
  )
);

// Send all transactions atomically
const txManager = new TransactionsManager(client);
const statuses = await txManager.clientSend(transactionItems);
```
