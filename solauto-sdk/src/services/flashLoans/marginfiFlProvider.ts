import {
  AccountMeta,
  createSignerFromKeypair,
  publicKey,
  Signer,
  transactionBuilder,
  TransactionBuilder,
} from "@metaplex-foundation/umi";
import { MARGINFI_ACCOUNTS } from "../../constants";
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
} from "../../marginfi-sdk";
import { FlProviderBase } from "./flProviderBase";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import {
  bytesToI80F48,
  consoleLog,
  fetchTokenPrices,
  findMarginfiAccounts,
  fromBaseUnit,
  getBankLiquidityAvailableBaseUnit,
  getEmptyMarginfiAccountsByAuthority,
  getTokenAccount,
  rpcAccountCreated,
  safeGetPrice,
  toBps,
  tokenInfo,
} from "../../utils";
import { TokenType } from "../../generated";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { FlashLoanDetails } from "../../types";

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
      this.setIntermediaryAccount([TokenType.Supply]);
      this.setIntermediaryAccount([TokenType.Debt]);
    } else {
      this.setIntermediaryAccount([TokenType.Supply, TokenType.Debt]);
    }
  }

  private async setAvailableBanks() {
    const availableBanks: string[] = [];
    const checkIfUsable = (group: string, mint: PublicKey) => {
      if (Object.keys(MARGINFI_ACCOUNTS[group]).includes(mint.toString())) {
        availableBanks.push(MARGINFI_ACCOUNTS[group][mint.toString()].bank);
      }
    };

    for (const group of Object.keys(MARGINFI_ACCOUNTS)) {
      checkIfUsable(group, this.supplyMint);
      checkIfUsable(group, this.debtMint);
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

  private setIntermediaryAccount(sources: TokenType[]) {
    const compatibleMarginfiAccounts = this.existingMarginfiAccounts.filter(
      (x) => x.group.toString() == this.liquidityBank(sources[0]).group
    );

    // TODO: instead of picking first compatibleMarginfiAccoutn, pick one where we already have it in the marginfi Lut
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

    for (const s of sources) {
      const data: IMFIAccount = {
        signer,
        accountPk,
        accountData,
      };

      const supply = s === TokenType.Supply;
      if (supply) {
        this.supplyImfiAccount = data;
      } else {
        this.debtImfiAccount = data;
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

    const remainingAccounts: AccountMeta[] = [];
    let flBankHadPrevBalance = false;

    if (iMfiAccount?.accountData) {
      iMfiAccount.accountData.lendingAccount.balances.forEach(async (x) => {
        if (x.active) {
          if (x.bankPk.toString() === bank.publicKey.toString()) {
            flBankHadPrevBalance = true;
          }

          // TODO: Don't dynamically pull from bank until Marginfi sorts out their price oracle issues.
          // const bankData = await safeFetchBank(this.umi, publicKey(accounts.data.bank));
          // const priceOracle = bankData!.config.oracleKeys[0];
          const priceOracle = publicKey(
            findMarginfiAccounts(toWeb3JsPublicKey(x.bankPk)).priceOracle
          );

          remainingAccounts.push(
            ...[
              {
                pubkey: x.bankPk,
                isSigner: false,
                isWritable: false,
              },
              {
                pubkey: priceOracle,
                isSigner: false,
                isWritable: false,
              },
            ]
          );
        }
      });
    }

    return transactionBuilder()
      .add(
        lendingAccountRepay(this.umi, {
          amount: flashLoan.baseUnitAmount,
          repayAll: !flBankHadPrevBalance,
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
        }).addRemainingAccounts(remainingAccounts)
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
