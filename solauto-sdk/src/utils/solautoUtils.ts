import { PublicKey } from "@solana/web3.js";
import { Program, publicKey, Umi } from "@metaplex-foundation/umi";
import {
  AutomationSettings,
  DCASettings,
  DCASettingsInpArgs,
  LendingPlatform,
  PositionState,
  PositionType,
  SolautoRebalanceType,
  SolautoSettingsParameters,
  SolautoSettingsParametersInpArgs,
  TokenType,
  getReferralStateSize,
  getSolautoErrorFromCode,
  getSolautoErrorFromName,
  getSolautoPositionAccountDataSerializer,
  getSolautoPositionSize,
} from "../generated";
import { getReferralState } from "./accountUtils";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { ALL_SUPPORTED_TOKENS } from "../constants";
import {
  findMarginfiAccounts,
  getAllMarginfiAccountsByAuthority,
} from "./marginfiUtils";
import { SolautoPositionDetails } from "../types/solauto";
import { QuoteResponse } from "@jup-ag/api";
import { createSolautoSettings } from "../solautoPosition";
import {
  SolautoClient,
  SolautoMarginfiClient,
  TxHandlerProps,
} from "../services";
import {
  calcTotalDebt,
  calcTotalSupply,
  fromBaseUnit,
  getLiqUtilzationRateBps,
  toBaseUnit,
  toRoundedUsdValue,
} from "./numberUtils";
import { fetchTokenPrices } from "./priceUtils";

export function createDynamicSolautoProgram(programId: PublicKey): Program {
  return {
    name: "solauto",
    publicKey: publicKey(programId),
    getErrorFromCode(code: number, cause?: Error) {
      return getSolautoErrorFromCode(code, this, cause);
    },
    getErrorFromName(name: string, cause?: Error) {
      return getSolautoErrorFromName(name, this, cause);
    },
    isOnCluster() {
      return true;
    },
  };
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

export async function getSolautoManagedPositions(
  umi: Umi,
  authority?: PublicKey,
  positionTypeFilter?: PositionType
): Promise<SolautoPositionDetails[]> {
  // bump: [u8; 1]
  // position_id: [u8; 1]
  // self_managed: u8 - (1 for true, 0 for false)
  // position_type: PositionType
  // padding: [u8; 4]
  // authority: pubkey
  // lending_platform: u8
  // padding: [u8; 7]
  // protocol account: pubkey
  // supply mint: pubkey
  // debt mint: pubkey

  const accounts = await umi.rpc.getProgramAccounts(
    umi.programs.get("solauto").publicKey,
    {
      commitment: "confirmed",
      dataSlice: {
        offset: 0,
        length: 1 + 1 + 1 + 1 + 4 + 32 + 1 + 7 + 32 + 32 + 32, // bump + position_id + self_managed + position_type + padding (4) + authority (pubkey) + lending_platform + padding (7) + protocol account (pubkey) + supply mint (pubkey) + debt mint (pubkey)
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
        ...(positionTypeFilter !== undefined
          ? [
              {
                memcmp: {
                  bytes: new Uint8Array([positionTypeFilter]),
                  offset: 3,
                },
              },
            ]
          : []),
      ],
    }
  );

  return accounts.map((x) => {
    const [position, _] = getSolautoPositionAccountDataSerializer().deserialize(
      new Uint8Array([
        ...x.data,
        ...Array(getSolautoPositionSize() - x.data.length).fill(0),
      ])
    );

    let tokens: [PublicKey, PublicKey] | undefined;
    if (position.position.lendingPlatform === LendingPlatform.Marginfi) {
      tokens = [
        findMarginfiAccounts(
          toWeb3JsPublicKey(position.position.protocolSupplyAccount)
        ).mint,
        findMarginfiAccounts(
          toWeb3JsPublicKey(position.position.protocolDebtAccount)
        ).mint,
      ];
    }
    // TODO: PF

    return {
      publicKey: toWeb3JsPublicKey(x.publicKey),
      authority: toWeb3JsPublicKey(position.authority),
      positionId: position.positionId[0],
      lendingPlatform: position.position.lendingPlatform,
      positionType: position.positionType,
      protocolAccount: toWeb3JsPublicKey(position.position.protocolUserAccount),
      supplyMint: tokens![0],
      debtMint: tokens![1],
    };
  });
}

export async function getAllReferralStates(umi: Umi): Promise<PublicKey[]> {
  const accounts = await umi.rpc.getProgramAccounts(
    umi.programs.get("solauto").publicKey,
    {
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
    }
  );

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

  const programId = umi.programs.get("solauto").publicKey;
  const userReferralState = getReferralState(
    user,
    toWeb3JsPublicKey(programId)
  );
  const accounts = await umi.rpc.getProgramAccounts(programId, {
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
  user: PublicKey,
  positionTypeFilter?: PositionType
): Promise<SolautoPositionDetails[]> {
  const solautoCompatiblePositions: SolautoPositionDetails[][] =
    await Promise.all([
      (async () => {
        const solautoManagedPositions = await getSolautoManagedPositions(
          umi,
          user,
          positionTypeFilter
        );
        return solautoManagedPositions.map((x) => ({
          ...x,
          authority: user,
        }));
      })(),
      (async () => {
        if (positionTypeFilter === PositionType.SafeLoan) {
          return [];
        }

        let marginfiPositions = await getAllMarginfiAccountsByAuthority(
          umi,
          user,
          undefined,
          true
        );
        marginfiPositions = marginfiPositions.filter(
          (x) =>
            x.supplyMint &&
            (x.debtMint!.equals(PublicKey.default) ||
              ALL_SUPPORTED_TOKENS.includes(x.debtMint!.toString()))
        );
        return marginfiPositions.map((x) => ({
          publicKey: x.marginfiAccount,
          authority: user,
          positionId: 0,
          positionType: PositionType.Leverage,
          lendingPlatform: LendingPlatform.Marginfi,
          protocolAccount: x.marginfiAccount,
          supplyMint: x.supplyMint,
          debtMint: x.debtMint,
        }));
      })(),
    ]);

  return solautoCompatiblePositions.flat();
}

export async function positionStateWithLatestPrices(
  state: PositionState,
  supplyPrice?: number,
  debtPrice?: number
): Promise<PositionState> {
  if (!supplyPrice || !debtPrice) {
    [supplyPrice, debtPrice] = await fetchTokenPrices([
      toWeb3JsPublicKey(state.supply.mint),
      toWeb3JsPublicKey(state.debt.mint),
    ]);
  }

  const supplyUsd = calcTotalSupply(state) * supplyPrice;
  const debtUsd = calcTotalDebt(state) * debtPrice;
  return {
    ...state,
    liqUtilizationRateBps: getLiqUtilzationRateBps(
      supplyUsd,
      debtUsd,
      state.liqThresholdBps
    ),
    netWorth: {
      baseUnit: toBaseUnit(
        supplyUsd > 0 ? (supplyUsd - debtUsd) / supplyPrice : 0,
        state.supply.decimals
      ),
      baseAmountUsdValue: toRoundedUsdValue(supplyUsd - debtUsd),
    },
    supply: {
      ...state.supply,
      amountCanBeUsed: {
        ...state.supply.amountCanBeUsed,
        baseAmountUsdValue: toRoundedUsdValue(
          fromBaseUnit(
            state.supply.amountCanBeUsed.baseUnit,
            state.supply.decimals
          ) * supplyPrice
        ),
      },
      amountUsed: {
        ...state.supply.amountUsed,
        baseAmountUsdValue: toRoundedUsdValue(supplyUsd),
      },
    },
    debt: {
      ...state.debt,
      amountCanBeUsed: {
        ...state.debt.amountCanBeUsed,
        baseAmountUsdValue: toRoundedUsdValue(
          fromBaseUnit(
            state.debt.amountCanBeUsed.baseUnit,
            state.debt.decimals
          ) * debtPrice
        ),
      },
      amountUsed: {
        ...state.debt.amountUsed,
        baseAmountUsdValue: toRoundedUsdValue(debtUsd),
      },
    },
  };
}

export function getClient(
  lendingPlatform: LendingPlatform,
  txHandlerProps: TxHandlerProps
) {
  if (lendingPlatform === LendingPlatform.Marginfi) {
    return new SolautoMarginfiClient(txHandlerProps);
  } else {
    // TODO: PF
  }
}

export function isMarginfiClient(
  client: SolautoClient
): client is SolautoMarginfiClient {
  return client.lendingPlatform == LendingPlatform.Marginfi;
}
// TODO: PF

export function hasFirstRebalance(rebalanceType: SolautoRebalanceType) {
  return [
    SolautoRebalanceType.Regular,
    SolautoRebalanceType.DoubleRebalanceWithFL,
    SolautoRebalanceType.FLRebalanceThenSwap,
  ].includes(rebalanceType);
}

export function hasLastRebalance(rebalanceType: SolautoRebalanceType) {
  return [
    SolautoRebalanceType.Regular,
    SolautoRebalanceType.DoubleRebalanceWithFL,
    SolautoRebalanceType.FLSwapThenRebalance,
  ].includes(rebalanceType);
}

type ContextAdjustment =
  | { type: "supply"; value: bigint }
  | { type: "debt"; value: bigint }
  | { type: "settings"; value: SolautoSettingsParametersInpArgs }
  | { type: "dca"; value: DCASettingsInpArgs }
  | { type: "dcaInBalance"; value: { amount: bigint; tokenType: TokenType } }
  | { type: "cancellingDca"; value: TokenType }
  | { type: "jupSwap"; value: QuoteResponse };

export class ContextUpdates {
  public supplyAdjustment = BigInt(0);
  public debtAdjustment = BigInt(0);
  public settings: SolautoSettingsParameters | undefined = undefined;
  public dca: DCASettings | undefined = undefined;
  public dcaInBalance?: { amount: bigint; tokenType: TokenType } = undefined;
  public cancellingDca: TokenType | undefined = undefined;
  public jupSwap: QuoteResponse | undefined = undefined;

  new(update: ContextAdjustment) {
    if (update.type === "supply") {
      this.supplyAdjustment += update.value;
    } else if (update.type === "debt") {
      this.debtAdjustment += update.value;
    } else if (update.type === "settings") {
      const settings = update.value;
      this.settings = createSolautoSettings(settings);
    } else if (update.type === "dca") {
      const dca = update.value;
      this.dca = {
        automation: {
          ...dca.automation,
          intervalSeconds: BigInt(dca.automation.intervalSeconds),
          unixStartDate: BigInt(dca.automation.unixStartDate),
          padding: new Uint8Array([]),
          padding1: [],
        },
        dcaInBaseUnit: BigInt(dca.dcaInBaseUnit),
        tokenType: dca.tokenType,
        padding: [],
      };
    } else if (update.type === "cancellingDca") {
      this.cancellingDca = update.value;
    } else if (update.type === "dcaInBalance") {
      this.dcaInBalance = update.value;
    } else if (update.type === "jupSwap") {
      this.jupSwap = update.value;
    }
  }

  reset() {
    this.supplyAdjustment = BigInt(0);
    this.debtAdjustment = BigInt(0);
    this.settings = undefined;
    this.dca = undefined;
    this.dcaInBalance = undefined;
    this.cancellingDca = undefined;
  }

  positionUpdates(): boolean {
    return (
      this.supplyAdjustment !== BigInt(0) ||
      this.debtAdjustment !== BigInt(0) ||
      this.dcaInBalance !== undefined ||
      this.settings !== undefined ||
      this.cancellingDca !== undefined
    );
  }
}
