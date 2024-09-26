const path = require("path");
const fs = require("fs");
const k = require("@metaplex-foundation/kinobi");

const idlsDir = path.join(__dirname, "idls");

function generateSolautoSDK() {
  const kinobi = k.createFromIdls([path.join(idlsDir, "solauto.json")]);

  kinobi.accept(
    new k.renderRustVisitor(
      path.join(__dirname, "programs", "solauto-sdk", "src", "generated")
    )
  );

  kinobi.accept(
    new k.renderJavaScriptVisitor(
      path.join(__dirname, "solauto-sdk", "src", "generated")
    )
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
    new k.renderJavaScriptVisitor(
      path.join(__dirname, "solauto-sdk", "src", sdkDirName)
    )
  );
}

generateSolautoSDK();

// generateRustSDKForAnchorIDL(
//   "marginfi-sdk",
//   "marginfi.json",
//   "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA"
// );
// generateTypescriptSDKForAnchorIDL(
//   "marginfi-sdk",
//   "marginfi.json",
//   "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA"
// );

generateRustSDKForAnchorIDL(
  "jupiter-sdk",
  "jupiter.json",
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
);