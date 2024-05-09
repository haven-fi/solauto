const path = require("path");
const fs = require("fs");
const k = require("@metaplex-foundation/kinobi");
const crypto = require("crypto");

const idlsDir = path.join(__dirname, "idls");

// function getAnchorIxDiscriminator(namespace, instructionName) {
//   // Concatenate the namespace and instruction name with a colon
//   const concatenated = `${namespace}:${instructionName}`;
//   // Create a SHA-256 hash of the concatenated string
//   const hash = crypto.createHash('sha256').update(concatenated).digest();
//   // Slice the first 8 bytes of the hash
//   const slice = hash.slice(0, 8);
//   // Convert the sliced bytes to a little-endian unsigned 64-bit integer using BigInt
//   let anchorIx = BigInt(0);
//   for (let i = 0; i < slice.length; i++) {
//       anchorIx += BigInt(slice[i]) << (8n * BigInt(i));
//   }
//   // Return the BigInt as a string
//   return anchorIx;
// }

function generateSolautoSDKs() {
  const kinobi = k.createFromIdls([path.join(idlsDir, "solauto.json")]);

  kinobi.update(
    k.updateProgramsVisitor({
      idl: { name: "solauto" },
    })
  );

  kinobi.accept(
    new k.renderRustVisitor(
      path.join(__dirname, "programs", "solauto-sdk", "src", "generated")
    )
  );

  kinobi.accept(
    new k.renderJavaScriptVisitor(
      path.join(__dirname, "typescript", "solauto-sdk", "generated")
    )
  );
}

function generateSDKForAnchorIDL(sdkDirName, idlFilename, programId) {
  const idlFilePath = path.join(idlsDir, idlFilename);

  const rawData = fs.readFileSync(idlFilePath, "utf8");
  let data = JSON.parse(rawData);
  data.metadata = {
    origin: "anchor",
    address: programId,
  };
  fs.writeFileSync(idlFilePath, JSON.stringify(data, null, 2), "utf8");

  const kinobi = k.createFromIdls([idlFilePath]);

  kinobi.update(
    k.updateProgramsVisitor({
      idl: { sdkDirName },
    })
  );

  kinobi.accept(
    new k.renderRustVisitor(
      path.join(__dirname, "programs", sdkDirName, "src", "generated")
    )
  );
}

generateSolautoSDKs();
generateSDKForAnchorIDL(
  "marginfi-sdk",
  "marginfi.json",
  "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA"
);
