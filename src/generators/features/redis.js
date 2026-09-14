"use strict";

const { isEsm, specifier } = require("../syntax");

/** configs/redis/index.{js,ts} — the single shared ioredis connection. Nothing else opens its own client. */
function generateRedisConfig(config) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";
  const errorParam = isTs ? "error: Error" : "error";
  // Named import avoids default-export interop issues with ioredis's dual CJS/ESM types under NodeNext.
  const imports = esm ? `import { Redis } from "ioredis";` : `const { Redis } = require("ioredis");`;
  const envImport = esm
    ? `import { env } from "${specifier(config, "../../helpers/env")}";`
    : `const { env } = require("../../helpers/env");`;

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
