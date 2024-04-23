const path = require("path");
const fs = require("fs");
const k = require("@metaplex-foundation/kinobi");

const idlsDir = path.join(__dirname, "idls");

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

function generateSDKForNonShankIDL(name, idlFilename, programId) {
  const idlFilePath = path.join(idlsDir, idlFilename);

  const rawData = fs.readFileSync(idlFilePath, "utf8");
  let data = JSON.parse(rawData);
  data.metadata = {
    address: programId ,
  };
  fs.writeFileSync(idlFilePath, JSON.stringify(data, null, 2), "utf8");

  const kinobi = k.createFromIdls([idlFilePath]);

  kinobi.update(
    k.updateProgramsVisitor({
      idl: { name },
    })
  );

  kinobi.accept(
    new k.renderRustVisitor(
      path.join(__dirname, "programs", name, "src", "generated")
    )
  );
}

generateSolautoSDKs();
generateSDKForNonShankIDL("marginfi-sdk", "marginfi.json", "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA");