import {
  transactionBuilder,
  TransactionBuilder,
} from "@metaplex-foundation/umi";
import { SolautoClient } from "../../solauto";
import { TransactionsManager } from "./transactionsManager";
import {
  buildSwbSubmitResponseTx,
  isSwitchboardMint,
  retryWithExponentialBackoff,
} from "../../../utils";
import { TransactionItem } from "../types";
import { getTransactionChores } from "../transactionUtils";
import { CHORES_TX_NAME } from "../../../constants";

export class ClientTransactionsManager extends TransactionsManager<SolautoClient> {
  private async updateLut(tx: TransactionBuilder, newLut: boolean) {
    const lutInputs = await this.lookupTables.getLutInputs();
    const updateLutTxName = `${newLut ? "create" : "update"} lookup table`;
    await retryWithExponentialBackoff(
      async (attemptNum, prevError) =>
        await this.sendTransaction(
          tx.setAddressLookupTables(lutInputs),
          updateLutTxName,
          attemptNum,
          this.getUpdatedPriorityFeeSetting(prevError, attemptNum),
          "skip-simulation"
        ),
      this.signableRetries,
      150,
      this.errorsToThrow
    );
    await this.txHandler.refetchReferralState();
  }

  private async addSwbOraclePullTxs(txs: TransactionItem[]) {
    const switchboardMints = [
      ...(isSwitchboardMint(this.txHandler.pos.supplyMint)
        ? [this.txHandler.pos.supplyMint]
        : []),
      ...(isSwitchboardMint(this.txHandler.pos.debtMint)
        ? [this.txHandler.pos.debtMint]
        : []),
    ];

    if (txs.find((x) => x.oracleInteractor) && switchboardMints.length) {
      this.txHandler.log("Requires oracle update(s)...");
      const oracleTxs = switchboardMints.map(
        (x) =>
          new TransactionItem(
            async () =>
              await buildSwbSubmitResponseTx(
                this.txHandler.connection,
                this.txHandler.signer,
                x
              ),
            this.updateOracleTxName
          )
      );
      txs.unshift(...oracleTxs);
    }
  }

  private async addChoreTxs(
    txs: TransactionItem[],
    updateLutTx?: TransactionBuilder
  ) {
    let [choresBefore, choresAfter] = await getTransactionChores(
      this.txHandler,
      transactionBuilder().add(
        txs
          .filter((x) => x.tx && x.tx.getInstructions().length > 0)
          .map((x) => x.tx!)
      )
    );

    if (updateLutTx) {
      choresBefore = choresBefore.prepend(updateLutTx);
    }

    if (choresBefore.getInstructions().length) {
      const chore = new TransactionItem(
        async () => ({ tx: choresBefore }),
        CHORES_TX_NAME
      );
      await chore.initialize();
      txs.unshift(chore);
      this.txHandler.log(
        "Chores before: ",
        choresBefore.getInstructions().length
      );
    }

    if (choresAfter.getInstructions().length) {
      const chore = new TransactionItem(
        async () => ({ tx: choresAfter }),
        CHORES_TX_NAME
      );
      await chore.initialize();
      txs.push(chore);
      this.txHandler.log(
        "Chores after: ",
        choresAfter.getInstructions().length
      );
    }
  }

  public async send(transactions: TransactionItem[]) {
    const items = [...transactions];
    const client = this.txHandler as SolautoClient;

    const updateLut = await client.updateLookupTable();

    const updateLutInSepTx = updateLut?.new || (updateLut?.accountsToAdd ?? []).length > 4;
    if (updateLut && updateLutInSepTx) {
      await this.updateLut(updateLut.tx, updateLut.new);
    }
    this.lookupTables.defaultLuts = client.defaultLookupTables();

    await this.addSwbOraclePullTxs(items);

    for (const item of items) {
      await item.initialize();
    }

    await this.addChoreTxs(
      items,
      updateLut && !updateLutInSepTx ? updateLut.tx : undefined
    );

    const result = await super.send(items).catch((e) => {
      client.resetLiveTxUpdates(false);
      throw e;
    });

    if (this.txRunType !== "only-simulate") {
      await client.resetLiveTxUpdates();
    }

    return result;
  }
}
