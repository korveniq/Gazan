"use strict";

const { isEsm, specifier } = require("../syntax");

/** configs/db/index.{js,ts} — centralized Mongoose connection lifecycle. */
function generateMongooseDbConfig(config) {
  const esm = isEsm(config);
  const imports = esm ? `import mongoose from "mongoose";` : `const mongoose = require("mongoose");`;
  const envImport = esm
    ? `import { env } from "${specifier(config, "../../helpers/env")}";`
    : `const { env } = require("../../helpers/env");`;

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
