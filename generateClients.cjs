const path = require("path");
const fs = require("fs");
const k = require("@metaplex-foundation/kinobi");

const idlsDir = path.join(__dirname, "idls");
const typescriptSdkDir = path.join(__dirname, "solauto-sdk", "src");

function generateSolautoSDK() {
  const kinobi = k.createFromIdls([path.join(idlsDir, "solauto.json")]);

  kinobi.accept(
    new k.renderRustVisitor(
      path.join(__dirname, "programs", "solauto-sdk", "src", "generated")
    )
  );

  kinobi.accept(
    new k.renderJavaScriptVisitor(path.join(typescriptSdkDir, "generated"))
  );
}

function fixAnchorIDL(idlFilename, programId) {
  const idlFilePath = path.join(idlsDir, idlFilename);

  const rawData = fs.readFileSync(idlFilePath, "utf8");
  let data = JSON.parse(rawData);
  data.metadata = {
    origin: "anchor",
    address: programId,
  };

  function flattenDefined(data) {
    if (typeof data === "object" && data !== null) {
      if (Array.isArray(data)) {
        return data.map(flattenDefined);
      } else if (data.defined && typeof data.defined === "object") {
        return { ...data, defined: data.defined.name };
      } else {
        return Object.keys(data).reduce((acc, key) => {
          acc[key] = flattenDefined(data[key]);
          return acc;
        }, {});
      }
    }
    return data;
  }

  data = flattenDefined(data);

  function replacePubkeyWithPublicKey(data) {
    if (typeof data === "object" && data !== null) {
      if (Array.isArray(data)) {
        return data.map(replacePubkeyWithPublicKey);
      } else {
        return Object.keys(data).reduce((acc, key) => {
          if (key === "pubkey") {
            acc["publicKey"] = data[key];
          } else {
            acc[key] = replacePubkeyWithPublicKey(data[key]);
          }
          return acc;
        }, {});
      }
    }
    return data;
  }

  data = replacePubkeyWithPublicKey(data);

  fs.writeFileSync(idlFilePath, JSON.stringify(data, null, 2), "utf8");
}

function generateRustSDKForAnchorIDL(sdkDirName, idlFilename, programId) {
  fixAnchorIDL(idlFilename, programId);

  const idlFilePath = path.join(idlsDir, idlFilename);
  const kinobi = k.createFromIdls([idlFilePath]);

  kinobi.accept(
    new k.renderRustVisitor(
      path.join(__dirname, "programs", sdkDirName, "src", "generated")
    )
  );
}

function generateTypescriptSDKForAnchorIDL(sdkDirName, idlFilename, programId) {
  fixAnchorIDL(idlFilename, programId);
  const idlFilePath = path.join(idlsDir, idlFilename);
  const kinobi = k.createFromIdls([idlFilePath]);

  kinobi.accept(
    new k.renderJavaScriptVisitor(path.join(typescriptSdkDir, sdkDirName))
  );
}

async function cleanJupiterTsSDK(exclusions = []) {
  const jupiterSdkDir = path.join(typescriptSdkDir, "jupiter-sdk");
  const exclusionPaths = exclusions.map((exclusion) =>
    path.join(jupiterSdkDir, exclusion)
  );

  try {
    // Read the contents of the directory
    const filesAndFolders = await fs.promises.readdir(jupiterSdkDir, {
      withFileTypes: true,
    });
    console.log(filesAndFolders);

    for (const entry of filesAndFolders) {
      const entryPath = path.resolve(jupiterSdkDir, entry.name);

      // Skip if the entry is in the exclusion list
      if (exclusionPaths.includes(entryPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        // Recursively delete contents of the directory
        await cleanJupiterTsSDK(entryPath, []);
        // After deleting the contents, delete the directory itself using fs.rm
        await fs.promises.rm(entryPath, { recursive: true, force: true });
      } else {
        // Delete the file
        await fs.promises.rm(entryPath, { force: true });
      }
    }
  } catch (err) {
    console.error(`Error deleting files/folders: ${err.message}`);
  }
}

generateSolautoSDK();

generateRustSDKForAnchorIDL(
  "marginfi-sdk",
  "marginfi.json",
  "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA"
);
generateTypescriptSDKForAnchorIDL(
  "marginfiSdk",
  "marginfi.json",
  "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA"
);

// generateRustSDKForAnchorIDL(
//   "jupiter-sdk",
//   "jupiter.json",
//   "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
// );
// generateTypescriptSDKForAnchorIDL(
//   "jupiterSdk",
//   "jupiter.json",
//   "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
// );
// generateTypescriptSDKForAnchorIDL(
//   "pythSdk",
//   "pyth.json",
//   "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT"
// );
// cleanJupiterTsSDK(["programs", "errors", "index.ts"]);
