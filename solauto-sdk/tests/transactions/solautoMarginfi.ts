import { describe, it } from "mocha";
import { LendingPlatform, ProgramEnv } from "../../src";
import { setupTest } from "../shared";
import { e2eTransactionTest } from "./shared";

describe("Solauto Marginfi tests", async () => {
  const signer = setupTest();
  const testProgram = false;
  const showLogs = false;
  const lpEnv: ProgramEnv = "Prod";

  it("open - deposit - borrow - rebalance to 0 - withdraw - close", async () => {
    await e2eTransactionTest(
      signer,
      testProgram,
      LendingPlatform.Marginfi,
      false,
      showLogs,
      lpEnv
    );
  });

  it("open - deposit - borrow - fl rebalance to 0 - withdraw - close", async () => {
    await e2eTransactionTest(
      signer,
      testProgram,
      LendingPlatform.Marginfi,
      true,
      showLogs,
      lpEnv
    );
  });
});
