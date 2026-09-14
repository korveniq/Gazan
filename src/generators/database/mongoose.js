"use strict";

const { isEsm } = require("../syntax");
const { sharedDir } = require("../paths");
const { resolveImportPath } = require("../aliasResolver");

/** configs/db/index.{js,ts} — centralized Mongoose connection lifecycle. */
function generateMongooseDbConfig(config, aliasConfig) {
  const esm = isEsm(config);
  const fromDir = `${sharedDir(config, "configs")}/db`;
  const envPath = resolveImportPath(config, aliasConfig, fromDir, `${sharedDir(config, "helpers")}/env`);

  const imports = esm ? `import mongoose from "mongoose";` : `const mongoose = require("mongoose");`;
  const envImport = esm ? `import { env } from "${envPath}";` : `const { env } = require("${envPath}");`;

  return `${imports}
${envImport}

async function connect() {
  await mongoose.connect(env.MONGODB_URI);
  console.log("[db] mongodb connected");
}

async function disconnect() {
  await mongoose.disconnect();
}

${esm ? "export { mongoose, connect, disconnect };" : "module.exports = { mongoose, connect, disconnect };"}
`;
}

module.exports = { generateMongooseDbConfig };
