## Solauto Typescript SDK

Solauto is a program on the Solana blockchain that lets you manage leveraged longs & shorts on auto-pilot to maximize your gains and eliminate the risk of liquidation. The typescript SDK is made for interacting with the Solauto program. This SDK provides tools for managing, & reading Solauto state data, as well as executing transactions.

## Basic Usage

```typescript
import { PublicKey } from "@solana/web3.js";
import * as solauto from "@haven-fi/solauto-sdk";

// Create new Solauto client
const client = solauto.getClient(solauto.LendingPlatform.MARGINFI, {
  signer: yourSigner,
  rpcUrl: "[YOUR_RPC_URL]",
});

// Initialize the client
const supplyMint = new PublicKey(NATIVE_MINT);
const debtMint = new PublicKey(USDC);
await client.initialize({
  positionId: 1,
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
const statuses = await new solauto.TransactionsManager(client).clientSend(
  transactionItems
);
```

## Rebalancing an existing position

```typescript
import { PublicKey } from "@solana/web3.js";
import * as solauto from "@haven-fi/solauto-sdk";

// Create new Solauto client
const client = solauto.getClient(solauto.LendingPlatform.MARGINFI, {
  signer: yourSigner,
  rpcUrl: "[YOUR_RPC_URL]",
});

// Initialize the client
await client.initialize({
  positionId: myPositionId,
  authority: "[POSITION AUTHORITY]",
});

const transactionItems = [
  solauto.rebalance(
    client,
    undefined // Provide target liquidation utilization rate if you want a specific LTV, otherwise it will rebalance according to position's settings (default)
  ),
];

const statuses = await new solauto.TransactionsManager(client).clientSend(
  transactionItems
);
```
