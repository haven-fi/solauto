import {
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import {
  fetchAllReferralState,
  getPositionExBulk,
  getReferralState,
  getSolanaRpcConnection,
  getSolautoManagedPositions,
  getTokenAccount,
  LOCAL_IRONFORGE_API_URL,
  SOLAUTO_PROD_PROGRAM,
} from "../src";
import { PublicKey } from "@solana/web3.js";
import { updateLookupTable } from "./shared";

let [conn, umi] = getSolanaRpcConnection(
  LOCAL_IRONFORGE_API_URL,
  SOLAUTO_PROD_PROGRAM
);

async function getMissingAccounts() {
  const allMissingAccounts: string[] = [];
  const allPositions = await getSolautoManagedPositions(umi);
  const positions = await getPositionExBulk(
    umi,
    allPositions.map((x) => x.publicKey!)
  );

  const referralStates = positions.map((x) =>
    getReferralState(
      x.authority,
      toWeb3JsPublicKey(umi.programs.get("solauto").publicKey)
    )
  );
  const referralStatesData = await fetchAllReferralState(
    umi,
    referralStates.map((x) => fromWeb3JsPublicKey(x))
  );

  const users = Array.from(
    new Set(positions.map((x) => x.authority.toString()))
  );
  const usersRequiringPatchLut = [];
  for (const user of users) {
    const authority = new PublicKey(user);
    const referralState = referralStatesData.find((x) =>
      toWeb3JsPublicKey(x.authority).equals(authority)
    )!;
    const lookupTable = referralState.lookupTable;

    const existingUserLUTAccounts =
      (
        await conn.getAddressLookupTable(toWeb3JsPublicKey(lookupTable), {
          commitment: "confirmed",
        })
      ).value?.state?.addresses ?? [];

    const userPositions = positions.filter((x) =>
      x.authority.equals(authority)
    );

    let requiredAccounts = userPositions.flatMap((x) => {
      return [
        getTokenAccount(authority, x.supplyMint),
        getTokenAccount(authority, x.debtMint),
        x.publicKey,
        x.lpUserAccount!,
        getTokenAccount(x.publicKey, x.supplyMint),
        getTokenAccount(x.publicKey, x.debtMint),
      ].map((x) => x.toString());
    });
    requiredAccounts = Array.from(new Set(requiredAccounts));

    const missingAccounts = requiredAccounts.filter(
      (x) =>
        existingUserLUTAccounts.find((y) => y.toString() === x) === undefined
    );

    if (missingAccounts.length) {
      console.log("\nMissing accounts for", referralState.publicKey.toString());
      console.log(missingAccounts);
      allMissingAccounts.push(...missingAccounts);
      usersRequiringPatchLut.push(user);
    }
  }

  console.log("Users requiring patch LUT:");
  console.log(Array.from(new Set(usersRequiringPatchLut)));
  return allMissingAccounts;
}

getMissingAccounts().then(async (accs) => {
  // await updateLookupTable(accs, new PublicKey(PATCH_LUT));
});
