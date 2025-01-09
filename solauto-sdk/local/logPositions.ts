import {
  buildHeliusApiUrl,
  getSolanaRpcConnection,
  getSolautoManagedPositions,
  SOLAUTO_PROD_PROGRAM,
} from "../src";

async function main() {
  const [_, umi] = getSolanaRpcConnection(
    buildHeliusApiUrl(process.env.HELIUS_API_KEY!),
    SOLAUTO_PROD_PROGRAM
  );
  const positions = await getSolautoManagedPositions(umi);
  // TODO: filter out certain wallet authorities using an env variable

  console.log("Total positions:", positions.length);
  // TODO: log net worth / balances
}

main().then((x) => x);
