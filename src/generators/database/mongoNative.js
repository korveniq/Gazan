"use strict";

const { isEsm, specifier } = require("../syntax");

/** configs/db/index.{js,ts} — centralized native MongoDB driver client lifecycle. */
function generateMongoNativeDbConfig(config) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";
  const imports = esm ? `import { MongoClient } from "mongodb";` : `const { MongoClient } = require("mongodb");`;
  const envImport = esm
    ? `import { env } from "${specifier(config, "../../helpers/env")}";`
    : `const { env } = require("../../helpers/env");`;

  return `${imports}
${envImport}

const client = new MongoClient(env.MONGODB_URI);
let db${isTs ? ": import(\"mongodb\").Db | undefined" : ""};
let connected = false;

async function connect() {
  if (connected) return;
  await client.connect();
  db = client.db();
  connected = true;
  console.log("[db] mongodb connected");
}

function getDb() {
  if (!db) throw new Error("Database not connected. Call connect() first.");
  return db;
}

async function disconnect() {
  await client.close();
}

${esm ? "export { client, getDb, connect, disconnect };" : "module.exports = { client, getDb, connect, disconnect };"}
`;
}

module.exports = { generateMongoNativeDbConfig };
