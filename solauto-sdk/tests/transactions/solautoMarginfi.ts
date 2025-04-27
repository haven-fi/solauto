import { describe, it } from "mocha";
import { LendingPlatform } from "../../src";
import { setupTest } from "../shared";
import { e2eTransactionTest } from "./shared";

describe("Solauto Marginfi tests", async () => {
  const signer = setupTest();
  const testProgram = false;

  it("open - deposit - borrow - rebalance to 0 - withdraw - close", async () => {
    await e2eTransactionTest(
      signer,
      testProgram,
      LendingPlatform.Marginfi,
      false,
      false
    );
  });

  it("open - deposit - borrow - fl rebalance to 0 - withdraw - close", async () => {
    await e2eTransactionTest(
      signer,
      testProgram,
      LendingPlatform.Marginfi,
      true,
      false
    );
  });
});
