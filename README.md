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
import { NATIVE_MINT } from "@solana/spl-token";
import * as solauto from "@haven-fi/solauto-sdk";

// Create new Solauto client
const client = solauto.getClient(solauto.LendingPlatform.MARGINFI, {
  signer: yourSigner,
  rpcUrl: "[YOUR_RPC_URL]",
});

// Initialize the client
const supplyMint = NATIVE_MINT;
const debtMint = new PublicKey(solauto.USDC);
await client.initializeNewSolautoPosition({
  positionId: 1,
  lpPoolAccount: solauto.getMarginfiAccounts().defaultGroup,
  supplyMint,
  debtMint,
});

// Open a position with custom settings
const [maxLtvBps, liqThresholdBps] =
  await client.pos.maxLtvAndLiqThresholdBps();
const settings: solauto.SolautoSettingsParametersInpArgs = {
  boostToBps: solauto.maxBoostToBps(maxLtvBps, liqThresholdBps),
  boostGap: 50,
  repayToBps: solauto.maxRepayToBps(maxLtvBps, liqThresholdBps),
  repayGap: 50,
};

const supplyUsdToDeposit = 100;
const debtUsdToBorrow = 60;
const [supplyPrice, debtPrice] = await solauto.fetchTokenPrices([
  supplyMint,
  debtMint,
]);

const transactionItems = [
  // Open position
  solauto.openSolautoPosition(client, settings),
  // Deposit supply (SOL) transaction
  solauto.deposit(
    client,
    toBaseUnit(
      supplyUsdToDeposit / supplyPrice,
      client.pos.supplyMintInfo.decimals
    )
  ),
  // Borrow debt (USDC) transaction
  solauto.borrow(
    client,
    toBaseUnit(debtUsdToBorrow / debtPrice, client.pos.debtMintInfo.decimals)
  ),
  // Rebalance to 0 LTV (repays all debt using collateral)
  solauto.rebalance(client, 0),
  // Withdraw remaining supply in position
  solauto.withdraw(client, "All"),
  // Close position
  solauto.closeSolautoPosition(client),
];

// Send all transactions atomically
const txManager = new solauto.ClientTransactionsManager({
  txHandler: client,
});
const statuses = await txManager.send(transactionItems);
```

## Rebalancing an existing position

```typescript
import * as solauto from "@haven-fi/solauto-sdk";

// Create new Solauto client
const client = solauto.getClient(solauto.LendingPlatform.MARGINFI, {
  signer: yourSigner,
  rpcUrl: "[YOUR_RPC_URL]",
});

// Initialize the client
await client.initializeExistingSolautoPosition({
  positionId: myPositionId,
});

const transactionItems = [
  solauto.rebalance(
    client,
    undefined // Provide target liquidation utilization rate if you want a specific LTV, otherwise it will rebalance according to position's settings (default)
  ),
];

const txManager = new solauto.ClientTransactionsManager({
  txHandler: client,
});
const statuses = await txManager.send(transactionItems);
```
