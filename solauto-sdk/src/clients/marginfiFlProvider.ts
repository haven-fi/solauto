import { publicKey } from "@metaplex-foundation/umi";
import { MARGINFI_ACCOUNTS } from "../constants";
import { Bank, MarginfiAccount, safeFetchAllBank } from "../marginfi-sdk";
import { FlProviderBase } from "./flProviderBase";
import { PublicKey } from "@solana/web3.js";
import {
  bytesToI80F48,
  fetchTokenPrices,
  fromBaseUnit,
  getBankLiquidityAvailableBaseUnit,
  getEmptyMarginfiAccountsByAuthority,
  safeGetPrice,
  tokenInfo,
} from "../utils";
import { TokenType } from "../generated";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";

export class MarginfiFlProvider extends FlProviderBase {
  private supplyBankLiquiditySource!: Bank;
  private debtBankLiquiditySource!: Bank;
  private existingMarginfiAccounts!: MarginfiAccount[];

  async initialize() {
    await super.initialize();
    await this.setAvailableBanks();
    this.existingMarginfiAccounts = await getEmptyMarginfiAccountsByAuthority(
      this.umi,
      toWeb3JsPublicKey(this.signer.publicKey)
    );
  }

  async setAvailableBanks() {
    const availableBanks: string[] = [];
    const checkIfUsable = (group: string, mint: PublicKey) => {
      if (Object.keys(MARGINFI_ACCOUNTS[group]).includes(mint.toString())) {
        availableBanks.push(MARGINFI_ACCOUNTS[group][mint.toString()].bank);
      }
    };

    for (const group of Object.keys(MARGINFI_ACCOUNTS)) {
      checkIfUsable(group, this.supplyMint);
      checkIfUsable(group, this.supplyMint);
    }

    const banks = await safeFetchAllBank(
      this.umi,
      availableBanks.map((x) => publicKey(x))
    );

    if (!safeGetPrice(this.supplyMint) || !safeGetPrice(this.debtMint)) {
      await fetchTokenPrices([this.supplyMint, this.debtMint]);
    }

    const mapBanksAndBalances = (mint: PublicKey) =>
      banks
        .filter((x) => toWeb3JsPublicKey(x.mint).equals(mint))
        .map((x) => {
          return [
            fromBaseUnit(
              getBankLiquidityAvailableBaseUnit(x, false),
              tokenInfo(mint).decimals
            ) * safeGetPrice(mint)!,
            x,
          ] as const;
        })
        .sort((a, b) => b[0] - a[0]);

    const supplyBanks = mapBanksAndBalances(this.supplyMint);
    const debtBanks = mapBanksAndBalances(this.debtMint);

    this.supplyBankLiquiditySource = supplyBanks[0][1];
    this.debtBankLiquiditySource = debtBanks[0][1];
  }

  private liquidityBank(liquiditySource: TokenType): Bank {
    if (liquiditySource === TokenType.Supply) {
      return this.supplyBankLiquiditySource;
    } else {
      return this.debtBankLiquiditySource;
    }
  }

  liquidityAvailable(source: TokenType): bigint {
    return getBankLiquidityAvailableBaseUnit(this.liquidityBank(source), false);
  }

  flFeeBps(source: TokenType): number {
    return bytesToI80F48(
      this.liquidityBank(source).config.interestRateConfig
        .protocolOriginationFee.value
    );
  }
}
