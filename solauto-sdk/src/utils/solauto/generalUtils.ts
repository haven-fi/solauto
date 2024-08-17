import { PublicKey } from "@solana/web3.js";
import { isOption, isSome, Umi } from "@metaplex-foundation/umi";
import {
  AutomationSettings,
  DCASettings,
  DCASettingsInpArgs,
  FeeType,
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
import { ALL_SUPPORTED_TOKENS, USD_DECIMALS } from "../../constants";
import {
  getAllMarginfiAccountsByAuthority,
  getMarginfiAccountPositionState,
} from "../marginfiUtils";
import { RebalanceAction, SolautoPositionDetails } from "../../types/solauto";

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
  automation: AutomationSettings
): boolean {
  return currentUnixSeconds() >= nextAutomationPeriodTimestamp(automation);
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
  currentUnixSeconds: number
): SolautoSettingsParameters {
  const boostToBps =
    settings.automation.targetPeriods > 0 &&
    eligibleForNextAutomationPeriod(settings.automation)
      ? getUpdatedValueFromAutomation(
          settings.boostToBps,
          settings.targetBoostToBps,
          settings.automation,
          currentUnixSeconds
        )
      : settings.boostToBps;

  return {
    ...settings,
    boostToBps,
  };
}

export function getSolautoFeesBps(
  isReferred: boolean,
  feeType: FeeType
): {
  solauto: number;
  referrer: number;
  total: number;
} {
  const fees = feeType === FeeType.Small ? 100 : 500;
  let referrer = 0;
  if (isReferred) {
    referrer = fees / 4;
  }

  return {
    solauto: fees - referrer,
    referrer,
    total: fees,
  };
}

export function eligibleForRebalance(
  positionState: PositionState,
  positionSettings: SolautoSettingsParameters,
  positionDca: DCASettings
): RebalanceAction | undefined {
  if (
    positionDca.automation.targetPeriods > 0 &&
    eligibleForNextAutomationPeriod(positionDca.automation)
  ) {
    return "dca";
  }

  if (positionState.supply.amountUsed.baseUnit === BigInt(0)) {
    return undefined;
  }

  const boostToBps =
    eligibleForRefresh(positionState, positionSettings) &&
    positionSettings.automation.targetPeriods > 0
      ? getUpdatedValueFromAutomation(
          positionSettings.boostToBps,
          positionSettings.targetBoostToBps,
          positionSettings.automation,
          currentUnixSeconds()
        )
      : positionSettings.boostToBps;
  const repayFrom = positionSettings.repayToBps + positionSettings.repayGap;
  const boostFrom = boostToBps - positionSettings.boostGap;

  if (positionState.liqUtilizationRateBps <= boostFrom) {
    return "boost";
  } else if (positionState.liqUtilizationRateBps >= repayFrom) {
    return "repay";
  }

  return undefined;
}

export function eligibleForRefresh(
  positionState: PositionState,
  positionSettings: SolautoSettingsParameters
): boolean {
  if (positionSettings.automation.targetPeriods > 0) {
    return eligibleForNextAutomationPeriod(positionSettings.automation);
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
    commitment: "finalized",
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
    commitment: "finalized",
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

  const userReferralState = await getReferralState(user);
  const accounts = await umi.rpc.getProgramAccounts(SOLAUTO_PROGRAM_ID, {
    commitment: "finalized",
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

export async function positionStateWithPrices(
  umi: Umi,
  state: PositionState,
  protocolAccount: PublicKey,
  lendingPlatform: LendingPlatform,
  supplyPrice?: number,
  debtPrice?: number
): Promise<PositionState | undefined> {
  if (currentUnixSeconds() - Number(state.lastUpdated) > 60 * 60 * 24 * 7) {
    if (lendingPlatform === LendingPlatform.Marginfi) {
      return await getMarginfiAccountPositionState(
        umi,
        protocolAccount,
        toWeb3JsPublicKey(state.supply.mint),
        toWeb3JsPublicKey(state.debt.mint)
      );
    } else {
      throw new Error("Lending platorm not yet supported");
    }
  }

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
      ...state.netWorth,
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
      this.settings = {
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
