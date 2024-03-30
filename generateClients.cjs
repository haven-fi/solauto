const path = require("path");
const k = require("@metaplex-foundation/kinobi");

const idlDir = path.join(__dirname, "idl");

const kinobi = k.createFromIdls([path.join(idlDir, "idl.json")]);

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
