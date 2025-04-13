import { PublicKey } from "@solana/web3.js";
import { AccountMeta, Program, publicKey, Umi } from "@metaplex-foundation/umi";
import {
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import { ProgramEnv, MarginfiAssetAccounts } from "../types";
import { PositionState, PositionTokenState, PriceType } from "../generated";
import {
  ALL_SUPPORTED_TOKENS,
  getMarginfiAccounts,
  MARGINFI_SPONSORED_SHARD_ID,
  MarginfiBankAccountsMap,
  PYTH_SPONSORED_SHARD_ID,
  TOKEN_INFO,
  USD_DECIMALS,
} from "../constants";
import {
  Balance,
  Bank,
  deserializeMarginfiAccount,
  fetchBank,
  getMarginfiAccountSize,
  getMarginfiErrorFromCode,
  getMarginfiErrorFromName,
  MarginfiAccount,
  OracleSetup,
  safeFetchAllBank,
  safeFetchBank,
  safeFetchMarginfiAccount,
} from "../marginfi-sdk";
import { ContextUpdates } from "./solautoUtils";
import { fetchTokenPrices, safeGetPrice } from "./priceUtils";
import { currentUnixSeconds, validPubkey } from "./generalUtils";
import {
  bytesToI80F48,
  calcNetWorthUsd,
  fromBaseUnit,
  getLiqUtilzationRateBps,
  toBaseUnit,
  toBps,
} from "./numberUtils";
import { getTokenAccountData } from "./accountUtils";
import {
  getMostUpToDatePythOracle,
  getPythPushOracleAddress,
} from "./pythUtils";
import { getAccountMeta } from "./solanaUtils";

export function createDynamicMarginfiProgram(env?: ProgramEnv): Program {
  return {
    name: "marginfi",
    publicKey: publicKey(getMarginfiAccounts(env ?? "Prod").program),
    getErrorFromCode(code: number, cause?: Error) {
      return getMarginfiErrorFromCode(code, this, cause);
    },
    getErrorFromName(name: string, cause?: Error) {
      return getMarginfiErrorFromName(name, this, cause);
    },
    isOnCluster() {
      return true;
    },
  };
}

export function umiWithMarginfiProgram(umi: Umi, marginfiEnv?: ProgramEnv) {
  return umi.use({
    install(umi) {
      umi.programs.add(
        createDynamicMarginfiProgram(marginfiEnv ?? "Prod"),
        false
      );
    },
  });
}

export async function getAllBankRelatedAccounts(
  umi: Umi,
  bankAccountsMap: MarginfiBankAccountsMap
): Promise<PublicKey[]> {
  const banks = Object.values(bankAccountsMap).flatMap((group) =>
    Object.values(group).map((accounts) => accounts.bank)
  );
  const banksData = await safeFetchAllBank(
    umi,
    banks.map((x) => publicKey(x))
  );

  const oracles = banksData
    .map((bank) => {
      const oracleKey = toWeb3JsPublicKey(bank.config.oracleKeys[0]);
      return bank.config.oracleSetup === OracleSetup.PythPushOracle
        ? [
            getPythPushOracleAddress(oracleKey, PYTH_SPONSORED_SHARD_ID),
            getPythPushOracleAddress(oracleKey, MARGINFI_SPONSORED_SHARD_ID),
          ]
        : [oracleKey];
    })
    .flat()
    .map((x) => x.toString());

  const otherAccounts = Object.entries(bankAccountsMap).flatMap(
    ([groupName, tokenMap]) =>
      Object.values(tokenMap).flatMap((accounts) => [
        groupName,
        accounts.liquidityVault,
        accounts.vaultAuthority,
      ])
  );

  return Array.from(new Set([...banks, ...oracles, ...otherAccounts]))
    .filter((x) => x !== PublicKey.default.toString())
    .map((x) => new PublicKey(x));
}

export async function fetchBankAddresses(umi: Umi, bankPk: PublicKey) {
  const bank = await fetchBank(umi, fromWeb3JsPublicKey(bankPk));
  const liquidityVault = toWeb3JsPublicKey(bank!.liquidityVault);
  const vaultAuthority = (await getTokenAccountData(umi, liquidityVault))
    ?.owner;
  const priceOracle = await getMarginfiPriceOracle(umi, { data: bank });

  return {
    bank: bankPk,
    liquidityVault,
    vaultAuthority,
    priceOracle,
  };
}

export async function getMarginfiPriceOracle(
  umi: Umi,
  bank: { pk?: PublicKey; data?: Bank }
) {
  if (!bank.data) {
    bank.data = await fetchBank(umi, fromWeb3JsPublicKey(bank.pk!));
  }

  const oracleKey = toWeb3JsPublicKey(bank.data.config.oracleKeys[0]);
  const priceOracle =
    bank.data.config.oracleSetup === OracleSetup.PythPushOracle
      ? await getMostUpToDatePythOracle(umi, [
          getPythPushOracleAddress(oracleKey, PYTH_SPONSORED_SHARD_ID),
          getPythPushOracleAddress(oracleKey, MARGINFI_SPONSORED_SHARD_ID),
        ])
      : oracleKey;

  return priceOracle;
}

interface AllMarginfiAssetAccounts extends MarginfiAssetAccounts {
  mint: PublicKey;
}

export function findMarginfiAccounts(
  bank: PublicKey
): AllMarginfiAssetAccounts {
  const search = (bankAccounts: MarginfiBankAccountsMap) => {
    for (const group in bankAccounts) {
      for (const key in bankAccounts[group]) {
        const account = bankAccounts[group][key];
        if (
          account.bank.toString().toLowerCase() ===
          bank.toString().toLowerCase()
        ) {
          return { ...account, mint: new PublicKey(key) };
        }
      }
    }
  };

  let res = search(getMarginfiAccounts("Prod").bankAccounts);
  if (res) {
    return res;
  }
  res = search(getMarginfiAccounts("Staging").bankAccounts);
  if (res) {
    return res;
  }

  throw new Error(`Marginfi accounts not found by the bank: ${bank}`);
}

export async function getRemainingAccountsForMarginfiHealthCheck(
  umi: Umi,
  balance: Balance
): Promise<AccountMeta[]> {
  if (!balance.active) {
    return [];
  }
  const priceOracle = await getMarginfiPriceOracle(umi, {
    pk: toWeb3JsPublicKey(balance.bankPk),
  });
  return [
    getAccountMeta(toWeb3JsPublicKey(balance.bankPk)),
    getAccountMeta(priceOracle),
  ];
}

export function calcMarginfiMaxLtvAndLiqThresholdBps(
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

  return [toBps(maxLtv, "Floor"), toBps(liqThreshold, "Floor")];
}

export async function getMarginfiMaxLtvAndLiqThresholdBps(
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
  if (!supply.bank && !validPubkey(supply.mint)) {
    return [0, 0];
  }

  const bankAccounts = getMarginfiAccounts(
    undefined,
    marginfiGroup
  ).bankAccounts;

  if (!supply.bank || supply.bank === null) {
    supply.bank = await safeFetchBank(
      umi,
      publicKey(
        bankAccounts[marginfiGroup.toString()][supply.mint.toString()].bank
      ),
      { commitment: "confirmed" }
    );
  }

  if ((!debt.bank || debt.bank === null) && !validPubkey(debt.mint)) {
    debt.bank = await safeFetchBank(
      umi,
      publicKey(
        bankAccounts[marginfiGroup.toString()][debt.mint.toString()].bank
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

  return calcMarginfiMaxLtvAndLiqThresholdBps(
    supply.bank!,
    debt.bank,
    supplyPrice
  );
}

export async function getEmptyMarginfiAccountsByAuthority(
  umi: Umi,
  authority: PublicKey
): Promise<MarginfiAccount[]> {
  const marginfiAccounts = await umi.rpc.getProgramAccounts(
    umi.programs.get("marginfi").publicKey,
    {
      commitment: "confirmed",
      filters: [
        {
          dataSize: getMarginfiAccountSize(),
        },
        {
          memcmp: {
            bytes: new Uint8Array(authority.toBuffer()),
            offset: 8 + 32, // Anchor account discriminator + group pubkey
          },
        },
        {
          // First balance is not active
          memcmp: {
            bytes: new Uint8Array([0]),
            offset: 8 + 32 + 32,
          },
        },
      ],
    }
  );

  return marginfiAccounts
    .map((x) => deserializeMarginfiAccount(x))
    .filter((x) => marginfiAccountEmpty(x));
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
    umi.programs.get("marginfi").publicKey,
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
      .sort((a, b) => calcNetWorthUsd(b.state) - calcNetWorthUsd(a.state))
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

  return BigInt(Math.floor(amountCanBeUsed));
}

async function getTokenUsage(
  bank: Bank | null,
  isAsset: boolean,
  shares: number,
  amountUsedAdjustment?: bigint,
  priceType?: PriceType
): Promise<PositionTokenState> {
  let amountUsed = 0;
  let amountCanBeUsed = BigInt(0);
  let marketPrice = 0;
  let originationFee = 0;

  if (bank !== null) {
    [marketPrice] = await fetchTokenPrices(
      [toWeb3JsPublicKey(bank.mint)],
      priceType
    );
    const [assetShareValue, liabilityShareValue] = getUpToDateShareValues(bank);
    const shareValue = isAsset ? assetShareValue : liabilityShareValue;
    amountUsed = shares * shareValue + Number(amountUsedAdjustment ?? 0);
    amountCanBeUsed = getBankLiquidityAvailableBaseUnit(bank, isAsset);
    originationFee = bytesToI80F48(
      bank?.config.interestRateConfig.protocolOriginationFee.value
    );
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
    borrowFeeBps: isAsset ? 0 : toBps(originationFee),
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

async function getBank(
  umi: Umi,
  data: BankSelection,
  marginfiGroup: PublicKey
) {
  const mint = validPubkey(data.mint) ? data.mint!.toString() : undefined;

  return data?.banksCache && mint
    ? data.banksCache[marginfiGroup.toString()][mint]
    : mint && mint !== PublicKey.default.toString()
      ? await safeFetchBank(
          umi,
          publicKey(
            getMarginfiAccounts(undefined, marginfiGroup).bankAccounts[
              marginfiGroup.toString()
            ][mint].bank
          ),
          { commitment: "confirmed" }
        )
      : null;
}

export async function getMarginfiAccountPositionState(
  umi: Umi,
  lpUserAccount: { pk?: PublicKey; data?: MarginfiAccount | null },
  marginfiGroup?: PublicKey,
  supply?: BankSelection,
  debt?: BankSelection,
  programEnv?: ProgramEnv,
  contextUpdates?: ContextUpdates,
  priceType?: PriceType
): Promise<
  | { supplyBank: Bank | null; debtBank: Bank | null; state: PositionState }
  | undefined
> {
  let marginfiAccount =
    lpUserAccount.data ??
    (validPubkey(lpUserAccount.pk)
      ? await safeFetchMarginfiAccount(umi, publicKey(lpUserAccount.pk!), {
          commitment: "confirmed",
        })
      : null);

  if (!supply) {
    supply = {};
  }
  if (!debt) {
    debt = {};
  }

  if (!marginfiGroup && marginfiAccount) {
    marginfiGroup = toWeb3JsPublicKey(marginfiAccount.group);
  }

  let supplyBank: Bank | null = await getBank(umi, supply, marginfiGroup!);
  let debtBank: Bank | null = await getBank(umi, debt, marginfiGroup!);

  let supplyUsage: PositionTokenState | undefined = undefined;
  let debtUsage: PositionTokenState | undefined = undefined;

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
        contextUpdates?.supplyAdjustment,
        priceType
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
        contextUpdates?.debtAdjustment,
        priceType
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
      contextUpdates?.supplyAdjustment
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
    (supplyMint.isStableCoin && debtMint.isStableCoin) ||
    !ALL_SUPPORTED_TOKENS.includes(supplyBank.mint.toString()) ||
    !ALL_SUPPORTED_TOKENS.includes(debtBank.mint.toString()) ||
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
      contextUpdates?.debtAdjustment
    );
  }

  const supplyPrice = safeGetPrice(toWeb3JsPublicKey(supplyBank.mint))!;
  let [maxLtvBps, liqThresholdBps] = await getMarginfiMaxLtvAndLiqThresholdBps(
    umi,
    marginfiGroup ?? getMarginfiAccounts(programEnv).defaultGroup,
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
        liqThresholdBps
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
      maxLtvBps,
      liqThresholdBps,
      lastRefreshed: BigInt(currentUnixSeconds()),
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
        (bytesToI80F48(x.assetShares.value) > 0.000001 ||
          bytesToI80F48(x.liabilityShares.value) > 0.000001)
    ) === undefined
  );
}
