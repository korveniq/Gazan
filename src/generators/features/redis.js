"use strict";

const { isEsm } = require("../syntax");
const { sharedDir } = require("../paths");
const { resolveImportPath } = require("../aliasResolver");

/** configs/redis/index.{js,ts} — the single shared ioredis connection. Nothing else opens its own client. */
function generateRedisConfig(config, aliasConfig) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";
  const errorParam = isTs ? "error: Error" : "error";
  const fromDir = `${sharedDir(config, "configs")}/redis`;
  const envPath = resolveImportPath(config, aliasConfig, fromDir, `${sharedDir(config, "helpers")}/env`);

  // Named import avoids default-export interop issues with ioredis's dual CJS/ESM types under NodeNext.
  const imports = esm ? `import { Redis } from "ioredis";` : `const { Redis } = require("ioredis");`;
  const envImport = esm ? `import { env } from "${envPath}";` : `const { env } = require("${envPath}");`;

  return `${imports}
${envImport}

const redisClient = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

redisClient.on("error", (${errorParam}) => {
  console.error("[redis] connection error:", error);
});

${esm ? "export { redisClient };" : "module.exports = { redisClient };"}
`;
}

module.exports = { generateRedisConfig };
