"use strict";

const { isEsm } = require("./syntax");

/**
 * Computes which env vars this project actually needs, based on the
 * normalized config. Nothing here is generated for disabled features.
 */
function buildEnvSpec(config) {
  const vars = [
    { name: "NODE_ENV", zod: `z.enum(["development", "test", "production"]).default("development")`, example: "development" },
    { name: "PORT", zod: `z.coerce.number().int().positive().default(3000)`, example: "3000" },
    { name: "CORS_ORIGIN", zod: `z.string().default("*")`, example: "*" },
  ];

  if (config.database.type === "postgresql") {
    vars.push({
      name: "DATABASE_URL",
      zod: `z.string().url()`,
      example: "postgresql://user:password@localhost:5432/mydb",
    });
  }

  if (config.database.type === "mongodb") {
    vars.push({
      name: "MONGODB_URI",
      zod: `z.string().min(1)`,
      example: "mongodb://localhost:27017/mydb",
    });
  }

  if (config.redis) {
    vars.push({
      name: "REDIS_URL",
      zod: `z.string().min(1).default("redis://localhost:6379")`,
      example: "redis://localhost:6379",
    });
  }

  // helpers/jwt.js always emits sign/verifyAccessToken (using JWT_SECRET/JWT_EXPIRES_IN) whenever
  // it's generated at all — which happens for EITHER 'jwt' or 'refresh-token' — so these must be
  // required in both cases, not just when 'jwt' itself is selected.
  if (
    config.authentication.enabled &&
    (config.authentication.methods.includes("jwt") || config.authentication.methods.includes("refresh-token"))
  ) {
    vars.push({ name: "JWT_SECRET", zod: `z.string().min(10)`, example: "replace-with-a-long-random-secret" });
    vars.push({ name: "JWT_EXPIRES_IN", zod: `z.string().default("15m")`, example: "15m" });
  }

  if (config.authentication.enabled && config.authentication.methods.includes("refresh-token")) {
    vars.push({ name: "JWT_REFRESH_SECRET", zod: `z.string().min(10)`, example: "replace-with-a-long-random-secret" });
    vars.push({ name: "JWT_REFRESH_EXPIRES_IN", zod: `z.string().default("7d")`, example: "7d" });
  }

  if (config.authentication.enabled && config.authentication.methods.includes("oauth")) {
    vars.push({ name: "OAUTH_CLIENT_ID", zod: `z.string().min(1)`, example: "your-oauth-client-id" });
    vars.push({ name: "OAUTH_CLIENT_SECRET", zod: `z.string().min(1)`, example: "your-oauth-client-secret" });
    vars.push({ name: "OAUTH_CALLBACK_URL", zod: `z.string().url()`, example: "http://localhost:3000/auth/oauth/callback" });
  }

  return vars;
}

function generateValidateEnvFile(config) {
  const vars = buildEnvSpec(config);
  const esm = isEsm(config);
  const isTs = config.language === "ts";

  const zodImport = esm ? `import { z } from "zod";` : `const { z } = require("zod");`;

  const schemaFields = vars.map((v) => `    ${v.name}: ${v.zod},`).join("\n");

  const fnBody = `${zodImport}

const envSchema = z.object({
${schemaFields}
  });

${isTs ? "export type Env = z.infer<typeof envSchema>;\n\n" : ""}function validateEnv(source${isTs ? ": NodeJS.ProcessEnv" : ""} = process.env)${isTs ? ": Env" : ""} {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const messages = result.error.issues
      .map((issue) => \`  \${issue.path.join(".")}: \${issue.message}\`)
      .join("\\n");
    throw new Error(\`Invalid environment configuration:\\n\${messages}\`);
  }

  return result.data;
}

${esm ? "export { validateEnv };" : "module.exports = { validateEnv };"}
`;

  return fnBody;
}

function generateEnvHelperFile(config, validateEnvImportPath) {
  const esm = isEsm(config);
  const dotenvImport = esm ? `import dotenv from "dotenv";` : `const dotenv = require("dotenv");`;
  const validateImport = esm
    ? `import { validateEnv } from "${validateEnvImportPath}";`
    : `const { validateEnv } = require("${validateEnvImportPath}");`;

  return `${dotenvImport}
${validateImport}

dotenv.config();

const env = validateEnv(process.env);

${esm ? "export { env };\nexport default env;" : "module.exports = { env };\nmodule.exports.default = env;"}
`;
}

function buildEnvFileContents(config, { forExample }) {
  const vars = buildEnvSpec(config);
  const lines = vars.map((v) => `${v.name}=${forExample ? v.example : v.example}`);
  return lines.join("\n") + "\n";
}

module.exports = { buildEnvSpec, generateValidateEnvFile, generateEnvHelperFile, buildEnvFileContents };
