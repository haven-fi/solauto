import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import {
  AccountMeta,
  createSignerFromKeypair,
  publicKey,
  Signer,
  transactionBuilder,
  TransactionBuilder,
} from "@metaplex-foundation/umi";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { getMarginfiAccounts } from "../../constants";
import {
  Bank,
  lendingAccountBorrow,
  lendingAccountCloseBalance,
  lendingAccountEndFlashloan,
  lendingAccountRepay,
  lendingAccountStartFlashloan,
  MarginfiAccount,
  marginfiAccountInitialize,
  safeFetchAllBank,
} from "../../externalSdks/marginfi";
import { FlProviderBase } from "./flProviderBase";
import {
  bytesToI80F48,
  composeRemainingAccounts,
  consoleLog,
  fetchTokenPrices,
  findMarginfiAccounts,
  fromBaseUnit,
  getBankLiquidityAvailableBaseUnit,
  getEmptyMarginfiAccountsByAuthority,
  getMarginfiPriceOracle,
  getRemainingAccountsForMarginfiHealthCheck,
  getTokenAccount,
  rpcAccountCreated,
  safeGetPrice,
  toBps,
  tokenInfo,
} from "../../utils";
import { FlashLoanDetails } from "../../types";
import { TokenType } from "../../generated";

interface IMFIAccount {
  signer?: Signer;
  accountPk: PublicKey;
  accountData?: MarginfiAccount;
}

export class MarginfiFlProvider extends FlProviderBase {
  private existingMarginfiAccounts!: MarginfiAccount[];
  private supplyBankLiquiditySource!: Bank;
  private debtBankLiquiditySource!: Bank;

  private supplyImfiAccount!: IMFIAccount;
  private debtImfiAccount!: IMFIAccount;
  private supplyRemainingAccounts!: AccountMeta[];
  private debtRemainingAccounts!: AccountMeta[];

  async initialize() {
    await this.setAvailableBanks();
    this.existingMarginfiAccounts = await getEmptyMarginfiAccountsByAuthority(
      this.umi,
      toWeb3JsPublicKey(this.signer.publicKey)
    );
    if (
      this.liquidityBank(TokenType.Supply).group.toString() !==
      this.liquidityBank(TokenType.Debt).group.toString()
    ) {
      await this.setIntermediaryAccount([TokenType.Supply]);
      await this.setIntermediaryAccount([TokenType.Debt]);
    } else {
      await this.setIntermediaryAccount([TokenType.Supply, TokenType.Debt]);
    }
  }

  private async setAvailableBanks() {
    const bankAccounts = getMarginfiAccounts(this.programEnv).bankAccounts;

    const availableBanks: string[] = [];
    const checkIfUsable = (group: string, mint: string) => {
      if (Object.keys(bankAccounts[group]).includes(mint)) {
        availableBanks.push(bankAccounts[group][mint].bank);
      }
    };

    for (const group of Object.keys(bankAccounts)) {
      checkIfUsable(group, this.supplyMint.toString());
      checkIfUsable(group, this.debtMint.toString());
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

  private async setIntermediaryAccount(sources: TokenType[]) {
    const compatibleMarginfiAccounts = this.existingMarginfiAccounts.filter(
      (x) => x.group.toString() == this.liquidityBank(sources[0]).group
    );

    const signer =
      compatibleMarginfiAccounts.length > 0
        ? undefined
        : createSignerFromKeypair(this.umi, this.umi.eddsa.generateKeypair());
    const accountPk =
      compatibleMarginfiAccounts.length > 0
        ? toWeb3JsPublicKey(compatibleMarginfiAccounts[0].publicKey)
        : toWeb3JsPublicKey(signer!.publicKey);
    const accountData =
      compatibleMarginfiAccounts.length > 0
        ? compatibleMarginfiAccounts[0]
        : undefined;

    if (signer) {
      this.flSigners.push(signer);
    }

    const remainingAccounts = accountData
      ? (
          await Promise.all(
            accountData.lendingAccount.balances.map((balance) =>
              getRemainingAccountsForMarginfiHealthCheck(this.umi, balance)
            )
          )
        ).flat()
      : [];

    for (const s of sources) {
      const data: IMFIAccount = {
        signer,
        accountPk,
        accountData,
      };

      const supply = s === TokenType.Supply;
      if (supply) {
        this.supplyImfiAccount = data;
        this.supplyRemainingAccounts = remainingAccounts;
      } else {
        this.debtImfiAccount = data;
        this.debtRemainingAccounts = remainingAccounts;
      }
      consoleLog(
        `${supply ? "Supply" : "Debt"} iMfi account:`,
        accountPk.toString()
      );
    }
  }

  async initializeIMfiAccounts(): Promise<TransactionBuilder> {
    const supplyImfiAccount = this.iMfiAccount(TokenType.Supply);
    const debtImfiAccount = this.iMfiAccount(TokenType.Debt);

    const [supplyImfiRpcAccount, debtImfiRpcAccount] =
      await this.umi.rpc.getAccounts([
        publicKey(supplyImfiAccount.accountPk),
        publicKey(debtImfiAccount.accountPk),
      ]);

    let tx = transactionBuilder();

    if (!rpcAccountCreated(supplyImfiRpcAccount)) {
      tx = tx.add(
        marginfiAccountInitialize(this.umi, {
          marginfiAccount: supplyImfiAccount.signer!,
          marginfiGroup: this.supplyBankLiquiditySource.group,
          authority: this.signer,
          feePayer: this.signer,
        })
      );
    }

    if (
      supplyImfiAccount.accountPk.toString() !==
        debtImfiAccount.accountPk.toString() &&
      !rpcAccountCreated(debtImfiRpcAccount)
    ) {
      tx = tx.add(
        marginfiAccountInitialize(this.umi, {
          marginfiAccount: debtImfiAccount.signer!,
          marginfiGroup: this.debtBankLiquiditySource.group,
          authority: this.signer,
          feePayer: this.signer,
        })
      );
    }

    return tx;
  }

  lutAccountsToAdd(): PublicKey[] {
    return [
      ...super.lutAccountsToAdd(),
      ...Array.from(
        new Set([
          this.iMfiAccount(TokenType.Supply).accountPk.toString(),
          this.iMfiAccount(TokenType.Debt).accountPk.toString(),
        ])
      ).map((x) => new PublicKey(x)),
    ];
  }

  liquiditySource(source: TokenType): PublicKey {
    return toWeb3JsPublicKey(this.liquidityBank(source).publicKey);
  }

  private liquidityBank(source: TokenType): Bank {
    return source === TokenType.Supply
      ? this.supplyBankLiquiditySource
      : this.debtBankLiquiditySource;
  }

  private iMfiAccount(source: TokenType): IMFIAccount {
    return source === TokenType.Supply
      ? this.supplyImfiAccount
      : this.debtImfiAccount;
  }

  liquidityAvailable(source: TokenType): bigint {
    return getBankLiquidityAvailableBaseUnit(this.liquidityBank(source), false);
  }

  flFeeBps(source: TokenType, signerFlashLoan?: boolean): number {
    if (signerFlashLoan) {
      return 0;
    }

    return toBps(
      bytesToI80F48(
        this.liquidityBank(source).config.interestRateConfig
          .protocolOriginationFee.value
      ),
      "Ceil"
    );
  }

  flashBorrow(
    flashLoan: FlashLoanDetails,
    destTokenAccount: PublicKey
  ): TransactionBuilder {
    if (flashLoan.signerFlashLoan) {
      return this.signerFlashBorrow(flashLoan, destTokenAccount);
    }

    const bank = this.liquidityBank(flashLoan.liquiditySource);
    const associatedBankAccs = findMarginfiAccounts(
      toWeb3JsPublicKey(bank.publicKey)
    );
    const iMfiAccount = this.iMfiAccount(flashLoan.liquiditySource)!;

    return transactionBuilder()
      .add(
        lendingAccountStartFlashloan(this.umi, {
          endIndex: 0, // We set this after building the transaction
          ixsSysvar: publicKey(SYSVAR_INSTRUCTIONS_PUBKEY),
          marginfiAccount: publicKey(iMfiAccount.accountPk),
          signer: this.signer,
        })
      )
      .add(
        lendingAccountBorrow(this.umi, {
          amount: flashLoan.baseUnitAmount,
          bank: publicKey(bank),
          bankLiquidityVault: publicKey(associatedBankAccs.liquidityVault),
          bankLiquidityVaultAuthority: publicKey(
            associatedBankAccs.vaultAuthority
          ),
          destinationTokenAccount: publicKey(destTokenAccount),
          marginfiAccount: publicKey(iMfiAccount.accountPk),
          marginfiGroup: this.liquidityBank(flashLoan.liquiditySource).group,
          signer: this.signer,
        })
      );
  }

  flashRepay(flashLoan: FlashLoanDetails): TransactionBuilder {
    if (flashLoan.signerFlashLoan) {
      return transactionBuilder();
    }

    const bank = this.liquidityBank(flashLoan.liquiditySource);
    const associatedBankAccs = findMarginfiAccounts(
      toWeb3JsPublicKey(bank.publicKey)
    );
    const marginfiGroup = toWeb3JsPublicKey(
      this.liquidityBank(flashLoan.liquiditySource).group
    );
    const iMfiAccount = this.iMfiAccount(flashLoan.liquiditySource)!;

    const remainingAccounts: AccountMeta[] =
      flashLoan.liquiditySource === TokenType.Supply
        ? this.supplyRemainingAccounts
        : this.debtRemainingAccounts;
    let iMfiAccountHadPrevFlBalance = remainingAccounts.find(
      (x) => x.pubkey.toString() === bank.publicKey.toString()
    );

    return transactionBuilder()
      .add(
        lendingAccountRepay(this.umi, {
          amount: flashLoan.baseUnitAmount,
          repayAll: !iMfiAccountHadPrevFlBalance,
          bank: bank.publicKey,
          bankLiquidityVault: publicKey(associatedBankAccs.liquidityVault),
          marginfiAccount: publicKey(iMfiAccount.accountPk),
          marginfiGroup: publicKey(marginfiGroup),
          signer: this.signer,
          signerTokenAccount: publicKey(
            getTokenAccount(
              toWeb3JsPublicKey(this.signer.publicKey),
              flashLoan.mint
            )
          ),
        })
      )
      .add(
        lendingAccountEndFlashloan(this.umi, {
          marginfiAccount: publicKey(iMfiAccount.accountPk),
          signer: this.signer,
        }).addRemainingAccounts(composeRemainingAccounts(remainingAccounts))
      );
  }

  closeBalance(
    marginfiAccount: PublicKey,
    bank: PublicKey,
    marginfiGroup: PublicKey
  ) {
    return transactionBuilder().add(
      lendingAccountCloseBalance(this.umi, {
        signer: this.signer,
        marginfiAccount: publicKey(marginfiAccount),
        bank: publicKey(bank),
        marginfiGroup: publicKey(marginfiGroup),
      })
    );
  }
}
