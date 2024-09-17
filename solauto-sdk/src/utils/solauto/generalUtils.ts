import { PublicKey } from "@solana/web3.js";
import { isOption, isSome, publicKey, Umi } from "@metaplex-foundation/umi";
import {
  AutomationSettings,
  DCASettings,
  DCASettingsInpArgs,
  LendingPlatform,
  PositionState,
  SOLAUTO_PROGRAM_ID,
  SolautoSettingsParameters,
  SolautoSettingsParametersInpArgs,
  getReferralStateSize,
  getSolautoPositionAccountDataSerializer,
  getSolautoPositionSize,
} from "../../generated";
import { currentUnixSeconds, getTokenPrices } from "../generalUtils";
import {
  fromBaseUnit,
  getLiqUtilzationRateBps,
  toBaseUnit,
} from "../numberUtils";
import { getReferralState } from "../accountUtils";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import {
  ALL_SUPPORTED_TOKENS,
  TOKEN_INFO,
  USD_DECIMALS,
} from "../../constants";
import { getAllMarginfiAccountsByAuthority } from "../marginfiUtils";
import { RebalanceAction, SolautoPositionDetails } from "../../types/solauto";

export function findMintByTicker(ticker: string): PublicKey {
  for (const key in TOKEN_INFO) {
    const account = TOKEN_INFO[key];
    if (
      account.ticker.toString().toLowerCase() === ticker.toString().toLowerCase()
    ) {
      return new PublicKey(key);
    }
  }
  throw new Error(`Token mint not found by the ticker: ${ticker}`);
}

function newPeriodsPassed(
  automation: AutomationSettings,
  currentUnixTimestamp: number
): number {
  return Math.min(
    automation.targetPeriods,
    automation.periodsPassed +
      Math.floor(
        (currentUnixTimestamp - Number(automation.unixStartDate)) /
          Number(automation.intervalSeconds)
      )
  );
}

export function nextAutomationPeriodTimestamp(
  automation: AutomationSettings
): number {
  return automation.periodsPassed === 0
    ? Number(automation.unixStartDate)
    : Number(automation.unixStartDate) +
        automation.periodsPassed * Number(automation.intervalSeconds);
}

export function eligibleForNextAutomationPeriod(
  automation: AutomationSettings,
  currentUnixTime: number
): boolean {
  return currentUnixTime >= nextAutomationPeriodTimestamp(automation);
}

export function getUpdatedValueFromAutomation(
  currValue: number,
  targetValue: number,
  automation: AutomationSettings,
  currentUnixTimestamp: number
) {
  const currRateDiff = currValue - targetValue;
  const progressPct =
    1 /
    Math.max(
      1,
      automation.targetPeriods -
        newPeriodsPassed(automation, currentUnixTimestamp)
    );
  const newValue = currValue - currRateDiff * progressPct;
  return newValue;
}

export function getAdjustedSettingsFromAutomation(
  settings: SolautoSettingsParameters,
  currentUnixTime: number
): SolautoSettingsParameters {
  const boostToBps =
    settings.automation.targetPeriods > 0 &&
    eligibleForNextAutomationPeriod(settings.automation, currentUnixTime)
      ? getUpdatedValueFromAutomation(
          settings.boostToBps,
          settings.targetBoostToBps,
          settings.automation,
          currentUnixTime
        )
      : settings.boostToBps;

  return {
    ...settings,
    boostToBps,
  };
}

export function eligibleForRebalance(
  positionState: PositionState,
  positionSettings: SolautoSettingsParameters,
  positionDca: DCASettings | undefined,
  currentUnixTime: number
): RebalanceAction | undefined {
  if (
    positionDca &&
    positionDca.automation.targetPeriods > 0 &&
    eligibleForNextAutomationPeriod(positionDca.automation, currentUnixTime)
  ) {
    return "dca";
  }

  if (positionState.supply.amountUsed.baseUnit === BigInt(0)) {
    return undefined;
  }

  const boostToBps =
    eligibleForRefresh(positionState, positionSettings, currentUnixTime) &&
    positionSettings.automation.targetPeriods > 0
      ? getUpdatedValueFromAutomation(
          positionSettings.boostToBps,
          positionSettings.targetBoostToBps,
          positionSettings.automation,
          currentUnixTime
        )
      : positionSettings.boostToBps;
  const repayFrom = positionSettings.repayToBps + positionSettings.repayGap;
  const boostFrom = boostToBps - positionSettings.boostGap;

  if (positionState.liqUtilizationRateBps < boostFrom) {
    return "boost";
  } else if (positionState.liqUtilizationRateBps > repayFrom) {
    return "repay";
  }

  return undefined;
}

export function eligibleForRefresh(
  positionState: PositionState,
  positionSettings: SolautoSettingsParameters,
  currentUnixTime: number
): boolean {
  if (positionSettings.automation.targetPeriods > 0) {
    return eligibleForNextAutomationPeriod(
      positionSettings.automation,
      currentUnixTime
    );
  } else {
    return (
      currentUnixSeconds() - Number(positionState.lastUpdated) >
      60 * 60 * 24 * 7
    );
  }
}

export async function getSolautoManagedPositions(
  umi: Umi,
  authority?: PublicKey
): Promise<SolautoPositionDetails[]> {
  // bump: [u8; 1]
  // position_id: [u8; 1]
  // self_managed: u8 - (1 for true, 0 for false)
  // padding: [u8; 5]
  // authority: Pubkey
  // lending_platform: u8

  const accounts = await umi.rpc.getProgramAccounts(SOLAUTO_PROGRAM_ID, {
    commitment: "confirmed",
    dataSlice: {
      offset: 0,
      length: 1 + 1 + 1 + 5 + 32 + 1, // bump + position_id + self_managed + padding + authority (pubkey) + lending_platform
    },
    filters: [
      {
        dataSize: getSolautoPositionSize(),
      },
      {
        memcmp: {
          bytes: new Uint8Array([0]),
          offset: 2,
        },
      },
      ...(authority
        ? [
            {
              memcmp: {
                bytes: new Uint8Array(authority.toBuffer()),
                offset: 8,
              },
            },
          ]
        : []),
    ],
  });

  return accounts.map((x) => {
    const [position, _] = getSolautoPositionAccountDataSerializer().deserialize(
      new Uint8Array([
        ...x.data,
        ...Array(getSolautoPositionSize() - x.data.length).fill(0),
      ])
    );
    return {
      publicKey: toWeb3JsPublicKey(x.publicKey),
      authority: toWeb3JsPublicKey(position.authority),
      positionId: position.positionId[0],
      lendingPlatform: position.position.lendingPlatform,
    };
  });
}

export async function getAllReferralStates(umi: Umi): Promise<PublicKey[]> {
  const accounts = await umi.rpc.getProgramAccounts(SOLAUTO_PROGRAM_ID, {
    commitment: "confirmed",
    dataSlice: {
      offset: 0,
      length: 0,
    },
    filters: [
      {
        dataSize: getReferralStateSize(),
      },
    ],
  });

  return accounts.map((x) => toWeb3JsPublicKey(x.publicKey));
}

export async function getReferralsByUser(
  umi: Umi,
  user: PublicKey
): Promise<PublicKey[]> {
  // bump: [u8; 1],
  // padding: [u8; 7],
  // authority: Pubkey,
  // referred_by_state: Pubkey,

  const userReferralState = getReferralState(user);
  const accounts = await umi.rpc.getProgramAccounts(SOLAUTO_PROGRAM_ID, {
    commitment: "confirmed",
    dataSlice: {
      offset: 0,
      length: 0,
    },
    filters: [
      {
        dataSize: getReferralStateSize(),
      },
      {
        memcmp: {
          bytes: userReferralState.toBytes(),
          offset: 1 + 7 + 32, // bump + padding + authority - target the referred_by_state field
        },
      },
    ],
  });

  return accounts.map((x) => toWeb3JsPublicKey(x.publicKey));
}

export async function getAllPositionsByAuthority(
  umi: Umi,
  user: PublicKey
): Promise<SolautoPositionDetails[]> {
  const allPositions: SolautoPositionDetails[] = [];

  const solautoManagedPositions = await getSolautoManagedPositions(umi, user);
  allPositions.push(
    ...solautoManagedPositions.map((x) => ({
      publicKey: x.publicKey,
      authority: user,
      positionId: x.positionId,
      lendingPlatform: x.lendingPlatform,
    }))
  );

  let marginfiPositions = await getAllMarginfiAccountsByAuthority(
    umi,
    user,
    true
  );
  marginfiPositions = marginfiPositions.filter(
    (x) =>
      x.supplyMint &&
      (x.debtMint!.equals(PublicKey.default) ||
        ALL_SUPPORTED_TOKENS.includes(x.debtMint!.toString()))
  );
  allPositions.push(
    ...marginfiPositions.map((x) => ({
      publicKey: x.marginfiAccount,
      authority: user,
      positionId: 0,
      lendingPlatform: LendingPlatform.Marginfi,
      protocolAccount: x.marginfiAccount,
      supplyMint: x.supplyMint,
      debtMint: x.debtMint,
    }))
  );

  // TODO support other platforms

  return allPositions;
}

export async function positionStateWithLatestPrices(
  state: PositionState,
  supplyPrice?: number,
  debtPrice?: number
): Promise<PositionState> {
  if (!supplyPrice || !debtPrice) {
    [supplyPrice, debtPrice] = await getTokenPrices([
      toWeb3JsPublicKey(state.supply.mint),
      toWeb3JsPublicKey(state.debt.mint),
    ]);
  }

  const supplyUsd =
    fromBaseUnit(state.supply.amountUsed.baseUnit, state.supply.decimals) *
    supplyPrice;
  const debtUsd =
    fromBaseUnit(state.debt.amountUsed.baseUnit, state.debt.decimals) *
    debtPrice;
  return {
    ...state,
    liqUtilizationRateBps: getLiqUtilzationRateBps(
      supplyUsd,
      debtUsd,
      state.liqThresholdBps
    ),
    netWorth: {
      baseUnit: toBaseUnit(
        (supplyUsd - debtUsd) / supplyPrice,
        state.supply.decimals
      ),
      baseAmountUsdValue: toBaseUnit(supplyUsd - debtUsd, USD_DECIMALS),
    },
    supply: {
      ...state.supply,
      amountUsed: {
        ...state.supply.amountUsed,
        baseAmountUsdValue: toBaseUnit(supplyUsd, USD_DECIMALS),
      },
    },
    debt: {
      ...state.debt,
      amountUsed: {
        ...state.debt.amountUsed,
        baseAmountUsdValue: toBaseUnit(debtUsd, USD_DECIMALS),
      },
    },
  };
}

interface AssetProps {
  mint: PublicKey;
  price?: number;
  amountUsed?: number;
}

export function createFakePositionState(
  supply: AssetProps,
  debt: AssetProps,
  maxLtvBps: number,
  liqThresholdBps: number
): PositionState {
  const supplyDecimals = TOKEN_INFO[supply.mint.toString()].decimals;
  const debtDecimals = TOKEN_INFO[debt.mint.toString()].decimals;

  const supplyUsd = (supply.amountUsed ?? 0) * (supply.price ?? 0);
  const debtUsd = (debt.amountUsed ?? 0) * (debt.price ?? 0);

  return {
    liqUtilizationRateBps: getLiqUtilzationRateBps(
      supplyUsd,
      debtUsd,
      liqThresholdBps
    ),
    supply: {
      amountUsed: {
        baseUnit: toBaseUnit(supply.amountUsed ?? 0, supplyDecimals),
        baseAmountUsdValue: toBaseUnit(supplyUsd, USD_DECIMALS),
      },
      amountCanBeUsed: {
        baseUnit: toBaseUnit(1000000, supplyDecimals),
        baseAmountUsdValue: BigInt(Math.round(1000000 * (supply.price ?? 0))),
      },
      baseAmountMarketPriceUsd: toBaseUnit(supply.price ?? 0, USD_DECIMALS),
      borrowFeeBps: 0,
      decimals: supplyDecimals,
      flashLoanFeeBps: 0,
      mint: publicKey(supply.mint),
      padding1: [],
      padding2: [],
      padding: new Uint8Array([]),
    },
    debt: {
      amountUsed: {
        baseUnit: toBaseUnit(debt.amountUsed ?? 0, debtDecimals),
        baseAmountUsdValue: toBaseUnit(debtUsd, USD_DECIMALS),
      },
      amountCanBeUsed: {
        baseUnit: toBaseUnit(1000000, debtDecimals),
        baseAmountUsdValue: BigInt(Math.round(1000000 * (debt.price ?? 0))),
      },
      baseAmountMarketPriceUsd: toBaseUnit(debt.price ?? 0, USD_DECIMALS),
      borrowFeeBps: 0,
      decimals: debtDecimals,
      flashLoanFeeBps: 0,
      mint: publicKey(debt.mint),
      padding1: [],
      padding2: [],
      padding: new Uint8Array([]),
    },
    netWorth: {
      baseUnit: supply.price
        ? toBaseUnit((supplyUsd - debtUsd) / supply.price, supplyDecimals)
        : BigInt(0),
      baseAmountUsdValue: toBaseUnit(supplyUsd - debtUsd, USD_DECIMALS),
    },
    maxLtvBps,
    liqThresholdBps,
    lastUpdated: BigInt(currentUnixSeconds()),
    padding1: [],
    padding2: [],
    padding: [],
  };
}

export function createSolautoSettings(settings: SolautoSettingsParametersInpArgs): SolautoSettingsParameters {
  return {
    automation:
      isOption(settings.automation) && isSome(settings.automation)
        ? {
            ...settings.automation.value,
            intervalSeconds: BigInt(
              settings.automation.value.intervalSeconds
            ),
            unixStartDate: BigInt(settings.automation.value.unixStartDate),
            padding: new Uint8Array([]),
            padding1: [],
          }
        : {
            targetPeriods: 0,
            periodsPassed: 0,
            intervalSeconds: BigInt(0),
            unixStartDate: BigInt(0),
            padding: new Uint8Array([]),
            padding1: [],
          },
    targetBoostToBps:
      isOption(settings.targetBoostToBps) &&
      isSome(settings.targetBoostToBps)
        ? settings.targetBoostToBps.value
        : 0,
    boostGap: settings.boostGap,
    boostToBps: settings.boostToBps,
    repayGap: settings.repayGap,
    repayToBps: settings.repayToBps,
    padding: new Uint8Array([]),
    padding1: [],
  };
}

type PositionAdjustment =
  | { type: "supply"; value: bigint }
  | { type: "debt"; value: bigint }
  | { type: "debtDcaIn"; value: bigint }
  | { type: "settings"; value: SolautoSettingsParametersInpArgs }
  | { type: "dca"; value: DCASettingsInpArgs };

export class LivePositionUpdates {
  public supplyAdjustment: bigint = BigInt(0);
  public debtAdjustment: bigint = BigInt(0);
  public debtTaBalanceAdjustment: bigint = BigInt(0);
  public settings: SolautoSettingsParameters | undefined = undefined;
  public activeDca: DCASettings | undefined = undefined;

  new(update: PositionAdjustment) {
    if (update.type === "supply") {
      this.supplyAdjustment += update.value;
    } else if (update.type === "debt") {
      this.debtAdjustment += update.value;
    } else if (update.type === "debtDcaIn") {
      this.debtTaBalanceAdjustment += update.value;
    } else if (update.type === "settings") {
      const settings = update.value;
      this.settings = createSolautoSettings(settings);
    } else if (update.type === "dca") {
      const dca = update.value;
      this.activeDca = {
        automation: {
          ...dca.automation,
          intervalSeconds: BigInt(dca.automation.intervalSeconds),
          unixStartDate: BigInt(dca.automation.unixStartDate),
          padding: new Uint8Array([]),
          padding1: [],
        },
        debtToAddBaseUnit: BigInt(dca.debtToAddBaseUnit),
        padding: new Uint8Array([]),
      };
    }
  }

  reset() {
    this.supplyAdjustment = BigInt(0);
    this.debtAdjustment = BigInt(0);
    this.debtTaBalanceAdjustment = BigInt(0);
    this.settings = undefined;
    this.activeDca = undefined;
  }

  hasUpdates(): boolean {
    return (
      this.supplyAdjustment !== BigInt(0) ||
      this.debtAdjustment !== BigInt(0) ||
      this.debtTaBalanceAdjustment !== BigInt(0) ||
      this.settings !== undefined
    );
  }
}
