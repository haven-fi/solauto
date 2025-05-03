import { PublicKey } from "@solana/web3.js";
import { AccountMeta, Program, publicKey, Umi } from "@metaplex-foundation/umi";
import {
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import { ProgramEnv, MarginfiAssetAccounts } from "../../types";
import {
  getMarginfiAccounts,
  MARGINFI_SPONSORED_SHARD_ID,
  MarginfiBankAccountsMap,
  PYTH_SPONSORED_SHARD_ID,
} from "../../constants";
import {
  Balance,
  Bank,
  fetchBank,
  getMarginfiErrorFromCode,
  getMarginfiErrorFromName,
  MarginfiAccount,
  OracleSetup,
  safeFetchAllBank,
} from "../../externalSdks/marginfi";
import { bytesToI80F48, fromBaseUnit, toBps } from "../numberUtils";
import { getTokenAccountData } from "../accountUtils";
import {
  getMostUpToDatePythOracle,
  getPythPushOracleAddress,
} from "../pythUtils";
import { getAccountMeta } from "../solanaUtils";

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
