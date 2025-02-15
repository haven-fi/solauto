import { Connection, PublicKey } from "@solana/web3.js";
import { publicKey, Umi } from "@metaplex-foundation/umi";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import {
  Bank,
  getMarginfiAccountSize,
  MARGINFI_PROGRAM_ID,
  MarginfiAccount,
  OracleSetup,
  safeFetchBank,
  safeFetchMarginfiAccount,
} from "../marginfi-sdk";
import { currentUnixSeconds } from "./generalUtils";
import {
  bytesToI80F48,
  fromBaseUnit,
  getLiqUtilzationRateBps,
  toBaseUnit,
  toBps,
} from "./numberUtils";
import {
  DEFAULT_MARGINFI_GROUP,
  MARGINFI_ACCOUNTS,
} from "../constants/marginfiAccounts";
import { MarginfiAssetAccounts } from "../types/accounts";
import { PositionState, PositionTokenUsage } from "../generated";
import { USD_DECIMALS } from "../constants/generalAccounts";
import { LivePositionUpdates } from "./solauto/generalUtils";
import { TOKEN_INFO } from "../constants";
import { fetchTokenPrices, safeGetPrice } from "./priceUtils";

interface AllMarginfiAssetAccounts extends MarginfiAssetAccounts {
  mint: PublicKey;
}

export function findMarginfiAccounts(
  bank: PublicKey
): AllMarginfiAssetAccounts {
  for (const group in MARGINFI_ACCOUNTS) {
    for (const key in MARGINFI_ACCOUNTS[group]) {
      const account = MARGINFI_ACCOUNTS[group][key];
      if (
        account.bank.toString().toLowerCase() === bank.toString().toLowerCase()
      ) {
        return { ...account, mint: new PublicKey(key) };
      }
    }
  }
  throw new Error(`Marginfi accounts not found by the bank: ${bank}`);
}

export function calcMarginfiMaxLtvAndLiqThreshold(
  supplyBank: Bank,
  debtBank: Bank,
  supplyPrice: number
): [number, number] {
  let maxLtv =
    bytesToI80F48(supplyBank.config.assetWeightInit.value) /
    bytesToI80F48(debtBank.config.liabilityWeightInit.value);
  const liqThreshold =
    bytesToI80F48(supplyBank.config.assetWeightMaint.value) /
    bytesToI80F48(debtBank.config.liabilityWeightMaint.value);

  const totalDepositedUsdValue =
    fromBaseUnit(
      BigInt(
        Math.round(
          bytesToI80F48(supplyBank.totalAssetShares.value) *
            bytesToI80F48(supplyBank.assetShareValue.value)
        )
      ),
      supplyBank.mintDecimals
    ) * supplyPrice!;
  if (
    supplyBank.config.totalAssetValueInitLimit !== BigInt(0) &&
    totalDepositedUsdValue > supplyBank.config.totalAssetValueInitLimit
  ) {
    const discount =
      Number(supplyBank.config.totalAssetValueInitLimit) /
      totalDepositedUsdValue;
    maxLtv = maxLtv * Number(discount);
  }

  return [maxLtv, liqThreshold];
}

export async function getMarginfiMaxLtvAndLiqThreshold(
  umi: Umi,
  marginfiGroup: PublicKey,
  supply: {
    mint: PublicKey;
    bank?: Bank | null;
  },
  debt: {
    mint: PublicKey;
    bank?: Bank | null;
  },
  supplyPrice?: number
): Promise<[number, number]> {
  if (!supply.bank && supply.mint.equals(PublicKey.default)) {
    return [0, 0];
  }

  if (!supply.bank || supply.bank === null) {
    supply.bank = await safeFetchBank(
      umi,
      publicKey(
        MARGINFI_ACCOUNTS[marginfiGroup.toString()][supply.mint.toString()].bank
      ),
      { commitment: "confirmed" }
    );
  }

  if (
    (!debt.bank || debt.bank === null) &&
    !debt.mint.equals(PublicKey.default)
  ) {
    debt.bank = await safeFetchBank(
      umi,
      publicKey(
        MARGINFI_ACCOUNTS[marginfiGroup.toString()][debt.mint.toString()].bank
      ),
      { commitment: "confirmed" }
    );
  }

  if (!supplyPrice) {
    const [price] = await fetchTokenPrices([
      toWeb3JsPublicKey(supply.bank!.mint),
    ]);
    supplyPrice = price;
  }

  if (!debt.bank || debt.bank === null) {
    return [0, 0];
  }

  return calcMarginfiMaxLtvAndLiqThreshold(
    supply.bank!,
    debt.bank,
    supplyPrice
  );
}

export async function getAllMarginfiAccountsByAuthority(
  umi: Umi,
  authority: PublicKey,
  group?: PublicKey,
  compatibleWithSolauto?: boolean
): Promise<
  { marginfiAccount: PublicKey; supplyMint?: PublicKey; debtMint?: PublicKey }[]
> {
  const marginfiAccounts = await umi.rpc.getProgramAccounts(
    MARGINFI_PROGRAM_ID,
    {
      commitment: "confirmed",
      dataSlice: {
        offset: 0,
        length: 0,
      },
      filters: [
        {
          dataSize: getMarginfiAccountSize(),
        },
        {
          memcmp: {
            bytes: new Uint8Array(authority.toBuffer()),
            offset: 40, // Anchor account discriminator + group pubkey
          },
        },
        ...(group
          ? [
              {
                memcmp: {
                  bytes: new Uint8Array(group.toBuffer()),
                  offset: 8,
                },
              },
            ]
          : []),
      ],
    }
  );

  if (compatibleWithSolauto) {
    const positionStates = await Promise.all(
      marginfiAccounts.map(async (x) => ({
        publicKey: x.publicKey,
        state: (
          await getMarginfiAccountPositionState(umi, {
            pk: toWeb3JsPublicKey(x.publicKey),
          })
        )?.state,
      }))
    );
    return positionStates
      .sort(
        (a, b) =>
          fromBaseUnit(
            b.state?.netWorth.baseAmountUsdValue ?? BigInt(0),
            USD_DECIMALS
          ) -
          fromBaseUnit(
            a.state?.netWorth.baseAmountUsdValue ?? BigInt(0),
            USD_DECIMALS
          )
      )
      .filter((x) => x.state !== undefined)
      .map((x) => ({
        marginfiAccount: toWeb3JsPublicKey(x.publicKey),
        supplyMint: toWeb3JsPublicKey(x.state!.supply.mint),
        debtMint: toWeb3JsPublicKey(x.state!.debt.mint),
      }));
  } else {
    return marginfiAccounts.map((x) => ({
      marginfiAccount: toWeb3JsPublicKey(x.publicKey),
    }));
  }
}

export function getBankLiquidityAvailableBaseUnit(
  bank: Bank | null,
  availableToDeposit: boolean
) {
  let amountCanBeUsed = 0;

  if (bank !== null) {
    const [assetShareValue, liabilityShareValue] = getUpToDateShareValues(bank);

    const totalDeposited =
      bytesToI80F48(bank.totalAssetShares.value) * assetShareValue;
    const totalBorrowed =
      bytesToI80F48(bank.totalLiabilityShares.value) * liabilityShareValue;

    amountCanBeUsed = availableToDeposit
      ? Number(bank.config.depositLimit) - totalDeposited
      : Math.min(
          totalDeposited - totalBorrowed,
          Math.max(0, Number(bank.config.borrowLimit) - totalBorrowed)
        );
  }

  return BigInt(Math.round(amountCanBeUsed));
}

async function getTokenUsage(
  bank: Bank | null,
  isAsset: boolean,
  shares: number,
  amountUsedAdjustment?: bigint
): Promise<PositionTokenUsage> {
  let amountUsed = 0;
  let amountCanBeUsed = BigInt(0);
  let marketPrice = 0;

  if (bank !== null) {
    [marketPrice] = await fetchTokenPrices([toWeb3JsPublicKey(bank.mint)]);
    const [assetShareValue, liabilityShareValue] = getUpToDateShareValues(bank);
    const shareValue = isAsset ? assetShareValue : liabilityShareValue;
    amountUsed = shares * shareValue + Number(amountUsedAdjustment ?? 0);
    amountCanBeUsed = getBankLiquidityAvailableBaseUnit(bank, isAsset);
  }

  return {
    mint: bank?.mint ?? publicKey(PublicKey.default),
    decimals: bank?.mintDecimals ?? 0,
    amountUsed: {
      baseUnit: BigInt(Math.round(amountUsed)),
      baseAmountUsdValue: bank
        ? toBaseUnit(
            fromBaseUnit(BigInt(Math.round(amountUsed)), bank.mintDecimals) *
              marketPrice,
            USD_DECIMALS
          )
        : BigInt(0),
    },
    amountCanBeUsed: {
      baseUnit: amountCanBeUsed,
      baseAmountUsdValue: bank
        ? toBaseUnit(
            fromBaseUnit(amountCanBeUsed, bank.mintDecimals) * marketPrice,
            USD_DECIMALS
          )
        : BigInt(0),
    },
    baseAmountMarketPriceUsd: toBaseUnit(marketPrice, USD_DECIMALS),
    flashLoanFeeBps: 0,
    borrowFeeBps: 0,
    padding1: [],
    padding2: [],
    padding: new Uint8Array([]),
  };
}

interface BankSelection {
  mint?: PublicKey;
  banksCache?: BanksCache;
}

type BanksCache = { [group: string]: { [mint: string]: Bank } };

export async function getMarginfiAccountPositionState(
  umi: Umi,
  protocolAccount: { pk: PublicKey; data?: MarginfiAccount },
  marginfiGroup?: PublicKey,
  supply?: BankSelection,
  debt?: BankSelection,
  livePositionUpdates?: LivePositionUpdates
): Promise<
  | { supplyBank: Bank | null; debtBank: Bank | null; state: PositionState }
  | undefined
> {
  let marginfiAccount =
    protocolAccount.data ??
    (await safeFetchMarginfiAccount(umi, publicKey(protocolAccount.pk), {
      commitment: "confirmed",
    }));

  if (!supply) {
    supply = {};
  }
  if (!debt) {
    debt = {};
  }

  if (!marginfiGroup && marginfiAccount) {
    marginfiGroup = toWeb3JsPublicKey(marginfiAccount.group);
  }

  let supplyBank: Bank | null =
    supply?.banksCache && supply.mint && marginfiGroup
      ? supply.banksCache[marginfiGroup!.toString()][supply?.mint?.toString()]
      : supply?.mint && supply?.mint !== PublicKey.default
        ? await safeFetchBank(
            umi,
            publicKey(
              MARGINFI_ACCOUNTS[marginfiGroup?.toString() ?? ""][
                supply?.mint.toString()
              ].bank
            ),
            { commitment: "confirmed" }
          )
        : null;
  let debtBank: Bank | null =
    debt?.banksCache && debt.mint && marginfiGroup
      ? debt.banksCache[marginfiGroup!.toString()][debt?.mint?.toString()]
      : debt?.mint && debt?.mint !== PublicKey.default
        ? await safeFetchBank(
            umi,
            publicKey(
              MARGINFI_ACCOUNTS[marginfiGroup?.toString() ?? ""][
                debt?.mint.toString()
              ].bank
            ),
            { commitment: "confirmed" }
          )
        : null;

  let supplyUsage: PositionTokenUsage | undefined = undefined;
  let debtUsage: PositionTokenUsage | undefined = undefined;

  if (
    marginfiAccount !== null &&
    marginfiAccount.lendingAccount.balances.filter((x) => x.active).length > 0
  ) {
    const supplyBalances = marginfiAccount.lendingAccount.balances.filter(
      (balance) =>
        balance.active && bytesToI80F48(balance.assetShares.value) > 0
    );
    const debtBalances = marginfiAccount.lendingAccount.balances.filter(
      (balance) =>
        balance.active && bytesToI80F48(balance.liabilityShares.value) > 0
    );

    if (supplyBalances.length > 1 || debtBalances.length > 1) {
      // Not compatible with Solauto
      return undefined;
    }

    if (supplyBalances.length > 0) {
      if (supplyBank === null) {
        supplyBank = await safeFetchBank(umi, supplyBalances[0].bankPk, {
          commitment: "confirmed",
        });
      }
      if (!supply.mint) {
        supply.mint = toWeb3JsPublicKey(supplyBank!.mint);
      }
      supplyUsage = await getTokenUsage(
        supplyBank!,
        true,
        bytesToI80F48(supplyBalances[0].assetShares.value),
        livePositionUpdates?.supplyAdjustment
      );
    }

    if (debtBalances.length > 0) {
      if (debtBank === null) {
        debtBank = await safeFetchBank(umi, debtBalances[0].bankPk, {
          commitment: "confirmed",
        });
      }
      if (!debt.mint) {
        debt.mint = toWeb3JsPublicKey(debtBank!.mint);
      }
      debtUsage = await getTokenUsage(
        debtBank!,
        false,
        bytesToI80F48(debtBalances[0].liabilityShares.value),
        livePositionUpdates?.debtAdjustment
      );
    }
  }

  if (supplyBank === null) {
    return undefined;
  }

  if (!supplyUsage) {
    supplyUsage = await getTokenUsage(
      supplyBank,
      true,
      0,
      livePositionUpdates?.supplyAdjustment
    );
  }

  if (debtBank === null) {
    return undefined;
  }

  const supplyMint = TOKEN_INFO[supplyBank.mint.toString()];
  const debtMint = TOKEN_INFO[debtBank.mint.toString()];

  if (
    supplyMint === undefined ||
    debtMint === undefined ||
    (!supplyMint.isStableCoin && !debtMint.isStableCoin) ||
    (supplyMint.isStableCoin && debtMint.isStableCoin) ||
    supplyBank.config.oracleSetup === OracleSetup.StakedWithPythPush ||
    debtBank.config.oracleSetup === OracleSetup.StakedWithPythPush
  ) {
    return undefined;
  }

  if (!debtUsage) {
    debtUsage = await getTokenUsage(
      debtBank,
      false,
      0,
      livePositionUpdates?.debtAdjustment
    );
  }

  const supplyPrice = safeGetPrice(supply.mint!)!;
  let [maxLtv, liqThreshold] = await getMarginfiMaxLtvAndLiqThreshold(
    umi,
    marginfiGroup ?? new PublicKey(DEFAULT_MARGINFI_GROUP),
    {
      mint: toWeb3JsPublicKey(supplyBank.mint),
      bank: supplyBank,
    },
    {
      mint: debtBank ? toWeb3JsPublicKey(debtBank.mint) : PublicKey.default,
      bank: debtBank,
    },
    supplyPrice
  );
  const supplyUsd = fromBaseUnit(
    supplyUsage!.amountUsed.baseAmountUsdValue,
    USD_DECIMALS
  );
  const debtUsd = fromBaseUnit(
    debtUsage?.amountUsed?.baseAmountUsdValue ?? BigInt(0),
    USD_DECIMALS
  );

  return {
    supplyBank,
    debtBank,
    state: {
      liqUtilizationRateBps: getLiqUtilzationRateBps(
        supplyUsd,
        debtUsd,
        toBps(liqThreshold)
      ),
      netWorth: {
        baseAmountUsdValue: toBaseUnit(supplyUsd - debtUsd, USD_DECIMALS),
        baseUnit: toBaseUnit(
          (supplyUsd - debtUsd) / supplyPrice,
          supplyUsage!.decimals
        ),
      },
      supply: supplyUsage!,
      debt: debtUsage!,
      maxLtvBps: toBps(maxLtv),
      liqThresholdBps: toBps(liqThreshold),
      lastUpdated: BigInt(currentUnixSeconds()),
      padding1: [],
      padding2: [],
      padding: [],
    },
  };
}

function marginfiInterestRateCurve(
  bank: Bank,
  utilizationRatio: number
): number {
  const optimalUr = bytesToI80F48(
    bank.config.interestRateConfig.optimalUtilizationRate.value
  );
  const plateauIr = bytesToI80F48(
    bank.config.interestRateConfig.plateauInterestRate.value
  );
  const maxIr = bytesToI80F48(
    bank.config.interestRateConfig.maxInterestRate.value
  );

  if (utilizationRatio <= optimalUr) {
    return (utilizationRatio * plateauIr) / optimalUr;
  } else {
    return (
      ((utilizationRatio - optimalUr) / (1 - optimalUr)) * (maxIr - plateauIr) +
      plateauIr
    );
  }
}

function calcInterestRate(
  bank: Bank,
  utilizationRatio: number
): [number, number] {
  const baseRate = marginfiInterestRateCurve(bank, utilizationRatio);

  const lendingRate = baseRate * utilizationRatio;

  const protocolIrFee = bytesToI80F48(
    bank.config.interestRateConfig.protocolIrFee.value
  );
  const insuranceIrFee = bytesToI80F48(
    bank.config.interestRateConfig.insuranceIrFee.value
  );
  const protocolFixedFeeApr = bytesToI80F48(
    bank.config.interestRateConfig.protocolFixedFeeApr.value
  );
  const insuranceFixedFeeApr = bytesToI80F48(
    bank.config.interestRateConfig.insuranceFeeFixedApr.value
  );
  const rateFee = protocolIrFee + insuranceIrFee;
  const totalFixedFeeApr = protocolFixedFeeApr + insuranceFixedFeeApr;
  const borrowingRate = baseRate * (1 + rateFee) + totalFixedFeeApr;

  return [lendingRate, borrowingRate];
}

function calcAccruedInterestPaymentPerPeriod(
  apr: number,
  timeDelta: number,
  shareValue: number
) {
  const irPerPeriod = (apr * timeDelta) / 31_536_000; // Seconds per year
  const newValue = shareValue * (1 + irPerPeriod);
  return newValue;
}

export function calculateAnnualAPYs(bank: Bank) {
  const totalAssets =
    bytesToI80F48(bank.totalAssetShares.value) *
    bytesToI80F48(bank.assetShareValue.value);
  const totalLiabilities =
    bytesToI80F48(bank.totalLiabilityShares.value) *
    bytesToI80F48(bank.liabilityShareValue.value);

  const utilizationRatio = totalLiabilities / totalAssets;
  return calcInterestRate(bank, utilizationRatio);
}

export function getUpToDateShareValues(bank: Bank): [number, number] {
  let timeDelta = currentUnixSeconds() - Number(bank.lastUpdate);
  const [lendingApr, borrowingApr] = calculateAnnualAPYs(bank);

  return [
    calcAccruedInterestPaymentPerPeriod(
      lendingApr,
      timeDelta,
      bytesToI80F48(bank.assetShareValue.value)
    ),
    calcAccruedInterestPaymentPerPeriod(
      borrowingApr,
      timeDelta,
      bytesToI80F48(bank.liabilityShareValue.value)
    ),
  ];
}

export function marginfiAccountEmpty(marginfiAccount: MarginfiAccount) {
  return (
    marginfiAccount.lendingAccount.balances.find(
      (x) =>
        x.bankPk.toString() !== PublicKey.default.toString() &&
        (Math.round(bytesToI80F48(x.assetShares.value)) != 0 ||
          Math.round(bytesToI80F48(x.liabilityShares.value)) != 0)
    ) === undefined
  );
}
